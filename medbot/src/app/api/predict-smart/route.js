
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import jwt from 'jsonwebtoken';
import Report from '@/models/Report';
import connectDB from '@/utils/db';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');

async function ensureUploadDirExists() {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
}

async function tryChestModel(imagePath) {
  const modelDir = path.resolve(process.cwd(), '..', 'model');
  const pythonScriptPath = path.join(modelDir, 'pipeline.py');
  
  return new Promise((resolve) => {
    exec(`python "${pythonScriptPath}" "${imagePath}"`, { cwd: modelDir }, (error, stdout, stderr) => {
      if (error) {
        console.log('Chest model error:', error.message);
        console.log('Chest model stderr:', stderr);
        resolve({ success: false, error: error.message });
        return;
      }
      
      if (stdout && stdout.trim()) {
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            // Check if result looks valid (has predicted_class and probabilities)
            if (result.predicted_class && result.probabilities && Array.isArray(result.probabilities)) {
              const chestClasses = ['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity'];
              if (chestClasses.includes(result.predicted_class)) {
                console.log('Chest model succeeded:', result.predicted_class);
                resolve({ success: true, result, type: 'chest' });
                return;
              }
            }
          }
        } catch (parseError) {
          console.log('Chest model parse error:', parseError.message);
          console.log('Chest model stdout:', stdout);
        }
      }
      
      resolve({ success: false });
    });
  });
}

async function tryFractureModel(imagePath) {
  const model1Dir = path.resolve(process.cwd(), '..', 'model1');
  const pythonScriptPath = path.join(model1Dir, 'pipeline_mura.py');
  
  // Verify script and model files exist
  try {
    await fs.access(pythonScriptPath);
    // Check for PyTorch model (.pth) - new format
    const pthPath = path.join(model1Dir, 'mura_bodypart_model.pth');
    const hasPth = await fs.access(pthPath).then(() => true).catch(() => false);
    
    // Also check for old Keras formats for backward compatibility
    const h5Path = path.join(model1Dir, 'mura_bodypart_model.h5');
    const kerasPath = path.join(model1Dir, 'mura_bodypart_model.keras');
    const hasH5 = await fs.access(h5Path).then(() => true).catch(() => false);
    const hasKeras = await fs.access(kerasPath).then(() => true).catch(() => false);
    
    if (!hasPth && !hasH5 && !hasKeras) {
      console.error('Fracture model files not found. Pth:', hasPth, 'H5:', hasH5, 'Keras:', hasKeras);
      return { success: false, error: 'Model files not found in model1 directory. Expected mura_bodypart_model.pth' };
    }
    console.log('Fracture model files found. Pth:', hasPth, 'H5:', hasH5, 'Keras:', hasKeras);
  } catch (error) {
    console.error('Error checking fracture model files:', error.message);
    return { success: false, error: `Script not found: ${error.message}` };
  }
  
  return new Promise((resolve) => {
    // Use proper quoting for Windows paths with spaces
    const command = process.platform === 'win32' 
      ? `python "${pythonScriptPath}" "${imagePath}"`
      : `python3 "${pythonScriptPath}" "${imagePath}"`;
    
    console.log('Executing fracture model command:', command);
    console.log('Working directory:', model1Dir);
    let resolved = false;
    
    // Set timeout for model execution (60 seconds)
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: 'Fracture model execution timeout (60s)' });
      }
    }, 60000);
    
    exec(command, { 
      cwd: model1Dir,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      timeout: 120000 // 2 minutes timeout for model loading and prediction
    }, (error, stdout, stderr) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      // TensorFlow outputs warnings to stderr, but they're not errors
      // Check if stderr contains only TensorFlow warnings (not actual errors)
      const hasOutput = stdout && stdout.trim().length > 0;
      const stderrText = stderr || '';
      const isTensorFlowWarning = stderrText && (
        stderrText.includes('tensorflow') || 
        stderrText.includes('oneDNN') || 
        stderrText.includes('WARNING') ||
        stderrText.includes('deprecated') ||
        stderrText.includes('I tensorflow') ||
        stderrText.includes('This TensorFlow binary')
      );
      
      // Check if stderr contains actual errors (not just warnings)
      const hasActualError = stderrText && (
        stderrText.includes('Error') ||
        stderrText.includes('Exception') ||
        stderrText.includes('Traceback') ||
        stderrText.includes('Failed')
      ) && !stderrText.match(/WARNING|INFO|I tensorflow/i);
      
      // Log for debugging
      console.log('Fracture model execution status:');
      console.log('  - Has stdout:', !!stdout, 'Length:', stdout?.length || 0);
      console.log('  - Has stderr:', !!stderr, 'Length:', stderr?.length || 0);
      console.log('  - Has error object:', !!error);
      console.log('  - Is TensorFlow warning only:', isTensorFlowWarning && !hasActualError);
      
      if (stdout) {
        console.log('Fracture model stdout (first 1000 chars):', stdout.substring(0, 1000));
      }
      if (stderr && !isTensorFlowWarning) {
        console.warn('Fracture model stderr (non-TensorFlow, first 1000 chars):', stderr.substring(0, 1000));
      }
      
      // If we have an error object AND no output AND actual errors in stderr (not just warnings)
      if (error && !hasOutput && hasActualError) {
        console.error('Fracture model error:', error.message);
        console.error('Fracture model error code:', error.code);
        console.error('Fracture model stderr (first 2000 chars):', stderr?.substring(0, 2000));
        resolve({ success: false, error: error.message });
        return;
      }
      
      // IMPORTANT: If we have error object but only TensorFlow warnings, 
      // the model might still have produced output - check stdout carefully
      if (error && isTensorFlowWarning && !hasActualError) {
        console.warn('Fracture model had error object but only TensorFlow warnings');
        console.warn('Error code:', error.code, 'Signal:', error.signal);
        console.warn('This might be a false positive - checking stdout for JSON anyway');
      }
      
      // Check stdout for JSON output (even if error object exists with only warnings)
      if (stdout && stdout.trim()) {
        try {
          // Try to find JSON in stdout (might have warnings before/after)
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            
            // Check for error in result
            if (result.error) {
              console.log('Fracture model returned error:', result.error);
              resolve({ success: false, error: result.error });
              return;
            }
            
            // Handle both array and object format for probabilities
            let probabilitiesArray = [];
            if (Array.isArray(result.probabilities)) {
              probabilitiesArray = result.probabilities;
            } else if (result.probabilities && typeof result.probabilities === 'object') {
              // Convert object to array in correct order
              const muraClasses = ['XR_ELBOW', 'XR_FINGER', 'XR_FOREARM', 'XR_HAND', 'XR_HUMERUS', 'XR_SHOULDER', 'XR_WRIST'];
              probabilitiesArray = muraClasses.map(cls => result.probabilities[cls] || 0);
            }
            
            // Check if result looks valid
            if (result.predicted_class && probabilitiesArray.length > 0) {
              const muraClasses = ['XR_ELBOW', 'XR_FINGER', 'XR_FOREARM', 'XR_HAND', 'XR_HUMERUS', 'XR_SHOULDER', 'XR_WRIST'];
              if (muraClasses.includes(result.predicted_class)) {
                // Normalize result format
                result.probabilities = probabilitiesArray;
                console.log('Fracture model succeeded:', result.predicted_class);
                resolve({ success: true, result, type: 'fracture' });
                return;
              }
            }
          }
        } catch (parseError) {
          console.log('Fracture model parse error:', parseError.message);
          console.log('Fracture model stdout (first 1000 chars):', stdout.substring(0, 1000));
        }
      }
      
      // Also check stderr for JSON (in case errors are sent there)
      if (stderr && stderr.trim()) {
        try {
          const stderrJsonMatch = stderr.match(/\{[\s\S]*"error"[\s\S]*\}/);
          if (stderrJsonMatch) {
            const errorResult = JSON.parse(stderrJsonMatch[0]);
            if (errorResult.error) {
              console.error('Fracture model error from stderr:', errorResult.error);
              resolve({ success: false, error: errorResult.error });
              return;
            }
          }
        } catch (e) {
          // Not JSON in stderr, that's okay
        }
      }
      
      // If we got here, we didn't get valid JSON output
      // Check if there's any useful information
      if (stdout && stdout.trim().length > 0) {
        console.error('Fracture model produced output but no valid JSON found');
        console.error('Full stdout:', stdout);
        console.error('Output (first 1000 chars):', stdout.substring(0, 1000));
        resolve({ success: false, error: `Fracture model output is not valid JSON. Output: ${stdout.substring(0, 200)}` });
      } else if (hasActualError) {
        console.error('Fracture model had actual errors in stderr');
        console.error('Full stderr:', stderr);
        resolve({ success: false, error: 'Fracture model execution failed. Check server logs for details.' });
      } else if (error && isTensorFlowWarning && !hasOutput) {
        // Error object exists but only TensorFlow warnings - model might have failed silently
        console.warn('Fracture model had error object but only TensorFlow warnings, no stdout');
        console.warn('Error code:', error.code);
        console.warn('Error signal:', error.signal);
        console.warn('Full stderr (first 2000 chars):', stderr?.substring(0, 2000));
        resolve({ success: false, error: `Fracture model failed to produce output. Error: ${error.message}. Check if model file loads correctly.` });
      } else if (isTensorFlowWarning && !hasOutput) {
        console.warn('Fracture model only produced TensorFlow warnings, no stdout output');
        console.warn('This might indicate the model failed to load or execute');
        resolve({ success: false, error: 'Fracture model produced no output. Model may have failed to load. Check Python environment and model files.' });
      } else {
        console.warn('Fracture model produced no output at all');
        resolve({ success: false, error: 'No output from fracture model' });
      }
    });
  });
}

export async function POST(req) {
  await connectDB();

  // Try to get token from cookies first, then from Authorization header
  let token = req.cookies.get('token')?.value;
  
  // If no cookie token, try Authorization header
  if (!token) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return NextResponse.json({ 
      error: 'Unauthorized',
      details: 'Please login to use this feature. No authentication token provided.'
    }, { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id;
  } catch (error) {
    console.error('Token verification error:', error.message);
    let errorMessage = 'Invalid or expired token';
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Your session has expired. Please login again.';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid authentication token. Please login again.';
    }
    return NextResponse.json({ 
      error: 'Unauthorized',
      details: errorMessage,
      code: error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
    }, { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await ensureUploadDirExists();

  const data = await req.formData();
  const file = data.get('image');
  const requestedReportTypeRaw = data.get('reportType');
  const requestedReportType = requestedReportTypeRaw
    ? requestedReportTypeRaw.toString().toLowerCase()
    : null;

  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 });
  }

  // Generate unique filename
  const timestamp = Date.now();
  const uniqueFileName = `${timestamp}_${file.name}`;
  const imagePath = path.join(uploadDir, uniqueFileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(imagePath, buffer);

  // Verify Python scripts exist
  const modelDir = path.resolve(process.cwd(), '..', 'model');
  const model1Dir = path.resolve(process.cwd(), '..', 'model1');
  const chestScriptPath = path.join(modelDir, 'pipeline.py');
  const fractureScriptPath = path.join(model1Dir, 'pipeline_mura.py');

  try {
    await fs.access(chestScriptPath);
    await fs.access(fractureScriptPath);
  } catch (error) {
    console.error('Python script not found:', error.message);
    return NextResponse.json({ 
      error: 'Model scripts not found',
      details: `Could not find Python scripts. Chest: ${chestScriptPath}, Fracture: ${fractureScriptPath}. Please ensure model folders are in the correct location.`
    }, { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    let finalResult = null;
    let reportType = null;

    if (requestedReportType === 'chest') {
      console.log('User requested chest model explicitly. Running chest pipeline only.');
      const chestResult = await tryChestModel(imagePath);
      if (!chestResult.success) {
        return NextResponse.json({
          error: 'Chest model failed',
          details: chestResult.error || 'Chest model did not return a valid prediction.',
        }, {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      finalResult = chestResult.result;
      reportType = 'chest';
    } else if (requestedReportType === 'fracture') {
      console.log('User requested fracture model explicitly. Running fracture pipeline only.');
      const fractureResult = await tryFractureModel(imagePath);
      if (!fractureResult.success) {
        return NextResponse.json({
          error: 'Fracture model failed',
          details: fractureResult.error || 'Fracture model did not return a valid prediction.',
        }, {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      finalResult = fractureResult.result;
      reportType = 'fracture';
    } else {
      // Try both models in parallel to determine image type automatically
      console.log('No explicit preference provided. Starting both models in parallel...');
      const [chestResult, fractureResult] = await Promise.all([
        tryChestModel(imagePath),
        tryFractureModel(imagePath)
      ]);

      console.log('Chest model result:', { success: chestResult.success, error: chestResult.error });
      console.log('Fracture model result:', { success: fractureResult.success, error: fractureResult.error });

      // Determine which model succeeded
      if (fractureResult.success && chestResult.success) {
        const fractureConf = fractureResult.result.probabilities[
          ['XR_ELBOW', 'XR_FINGER', 'XR_FOREARM', 'XR_HAND', 'XR_HUMERUS', 'XR_SHOULDER', 'XR_WRIST']
            .indexOf(fractureResult.result.predicted_class)
        ];
        const chestConf = chestResult.result.probabilities[
          ['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity']
            .indexOf(chestResult.result.predicted_class)
        ];
        
        if (fractureConf > 0.3 || fractureConf > chestConf) {
          finalResult = fractureResult.result;
          reportType = 'fracture';
          console.log('Using fracture model (both succeeded, fracture preferred):', finalResult.predicted_class, 'conf:', fractureConf);
        } else {
          finalResult = chestResult.result;
          reportType = 'chest';
          console.log('Using chest model (both succeeded, chest higher confidence):', finalResult.predicted_class, 'conf:', chestConf);
        }
      } else if (fractureResult.success) {
        finalResult = fractureResult.result;
        reportType = 'fracture';
        console.log('Using fracture model result (only fracture succeeded):', finalResult.predicted_class);
      } else if (chestResult.success) {
        if (fractureResult.error && !fractureResult.error.includes('timeout')) {
          console.warn('Fracture model failed but chest succeeded. Using chest as fallback.');
          console.warn('Fracture error:', fractureResult.error);
        }
        finalResult = chestResult.result;
        reportType = 'chest';
        console.log('Using chest model (fracture failed):', finalResult.predicted_class);
      } else {
        const chestError = chestResult.error || 'Unknown error';
        const fractureError = fractureResult.error || 'Unknown error';
        console.error('Both models failed. Chest:', chestError, 'Fracture:', fractureError);
        
        return NextResponse.json({ 
          error: 'Failed to process image with either model',
          details: `Neither model could process the image. Chest model: ${chestError}. Fracture model: ${fractureError}. Please ensure the image is a valid X-ray and Python models are properly configured.`
        }, { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (!finalResult || !reportType) {
      return NextResponse.json({
        error: 'Failed to produce prediction',
        details: 'No model produced a valid result.',
      }, {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add metadata
    finalResult.reportType = reportType;
    finalResult.imageURL = `/uploads/${uniqueFileName}`;

    if (reportType === 'fracture') {
      finalResult.fractureLocation = finalResult.predicted_class;
    }

    // Calculate confidence score
    let confidenceScore;
    if (reportType === 'fracture') {
      const muraClasses = ['XR_ELBOW', 'XR_FINGER', 'XR_FOREARM', 'XR_HAND', 'XR_HUMERUS', 'XR_SHOULDER', 'XR_WRIST'];
      const classIndex = muraClasses.indexOf(finalResult.predicted_class);
      confidenceScore = classIndex >= 0 ? finalResult.probabilities[classIndex] : finalResult.probabilities[0];
    } else {
      const chestClasses = ['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity'];
      const classIndex = chestClasses.indexOf(finalResult.predicted_class);
      confidenceScore = classIndex >= 0 ? finalResult.probabilities[classIndex] : finalResult.probabilities[0];
    }

    // Save report to MongoDB
    const reportData = {
      userId,
      reportType,
      predictedClass: finalResult.predicted_class,
      confidenceScore,
      imageURL: `/uploads/${uniqueFileName}`,
    };

    if (reportType === 'fracture') {
      reportData.fractureLocation = finalResult.predicted_class;
    }

    const report = new Report(reportData);
    await report.save();

    return NextResponse.json(finalResult);
  } catch (error) {
    console.error('Error in smart prediction:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: 'Failed to process image',
      details: error.message || 'An unexpected error occurred. Please check server logs for details.',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

