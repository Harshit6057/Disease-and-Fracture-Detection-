import os
import sys
import json
import numpy as np
import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image

# ------------------------------
# CONFIG
# ------------------------------

IMG_SIZE = 224
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# Must match training order (from notebook)
MURA_CLASSES = [
    "XR_ELBOW",
    "XR_FINGER",
    "XR_FOREARM",
    "XR_HAND",
    "XR_HUMERUS",
    "XR_SHOULDER",
    "XR_WRIST"
]

# ------------------------------
# MODEL ARCHITECTURE (matching notebook)
# ------------------------------

def create_mura_model(num_classes=7):
    """Create the MURA model with same architecture as training"""
    # Load pretrained DenseNet121
    model = models.densenet121(weights=models.DenseNet121_Weights.IMAGENET1K_V1)
    
    # Replace classifier (same as notebook)
    num_ftrs = model.classifier.in_features
    model.classifier = nn.Sequential(
        nn.Linear(num_ftrs, 512),
        nn.ReLU(),
        nn.Dropout(0.3),
        nn.Linear(512, num_classes)
    )
    
    return model

# ------------------------------
# MODEL LOADING
# ------------------------------

def load_mura_model(model_path="mura_bodypart_model.pth"):
    """Load the PyTorch MURA model"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_file = os.path.join(base_dir, model_path)
    
    if not os.path.exists(model_file):
        raise FileNotFoundError(f"Model file not found: {model_file}")
    
    try:
        print(f"Loading PyTorch model from: {model_file}", file=sys.stderr)
        
        # Create model architecture
        model = create_mura_model(num_classes=len(MURA_CLASSES))
        
        # Load state dict
        model.load_state_dict(torch.load(model_file, map_location=DEVICE))
        model.to(DEVICE)
        model.eval()  # Set to evaluation mode
        
        print("Model loaded successfully", file=sys.stderr)
        return model
    except Exception as e:
        error_msg = str(e)[:500]
        print(f"Failed to load model: {error_msg}", file=sys.stderr)
        raise

# ------------------------------
# IMAGE PREPROCESSING (matching notebook)
# ------------------------------

def preprocess_image(image_path, target_size=(IMG_SIZE, IMG_SIZE)):
    """Load and preprocess the image for the model (same as notebook validation transform)"""
    try:
        # Load image
        img = Image.open(image_path).convert('RGB')
        
        # Define transform (same as notebook val_transform)
        transform = transforms.Compose([
            transforms.Resize((target_size[0], target_size[1])),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])  # ImageNet normalization
        ])
        
        # Apply transform
        img_tensor = transform(img)
        
        # Add batch dimension
        img_tensor = img_tensor.unsqueeze(0)
        
        return img_tensor
    except Exception as e:
        print(f"Error preprocessing image: {str(e)}", file=sys.stderr)
        raise

# ------------------------------
# PREDICTION
# ------------------------------

def predict_fracture(image_path, model):
    """Run prediction on a single image"""
    try:
        # Preprocess the image
        print(f"Preprocessing image: {image_path}", file=sys.stderr)
        processed_img = preprocess_image(image_path)
        processed_img = processed_img.to(DEVICE)
        print(f"Image preprocessed, shape: {processed_img.shape}", file=sys.stderr)
        
        # Make prediction
        print("Running model prediction...", file=sys.stderr)
        with torch.no_grad():
            outputs = model(processed_img)
            # Apply softmax to get probabilities
            probabilities = torch.softmax(outputs, dim=1)
        
        print(f"Prediction completed, shape: {probabilities.shape}", file=sys.stderr)
        
        # Get the predicted class and confidence
        probabilities_np = probabilities.cpu().numpy()[0]
        predicted_class_idx = np.argmax(probabilities_np)
        predicted_class = MURA_CLASSES[predicted_class_idx]
        
        # Convert probabilities to list (in correct order)
        probabilities_list = [float(prob) for prob in probabilities_np]
        
        # Prepare the result - use array format for compatibility
        result = {
            "predicted_class": predicted_class,
            "probabilities": probabilities_list
        }
        
        print(f"Prediction result: {predicted_class}", file=sys.stderr)
        return result
    except Exception as e:
        error_msg = f"Error during prediction: {str(e)}"
        print(error_msg, file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise

# ------------------------------
# MAIN
# ------------------------------

if __name__ == "__main__":
    if len(sys.argv) != 2:
        error_msg = json.dumps({"error": "Usage: python pipeline_mura.py <image_path>"})
        print(error_msg, file=sys.stderr)
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    # Suppress warnings
    import warnings
    warnings.filterwarnings('ignore')
    
    try:
        # Load the model
        print("Starting model loading...", file=sys.stderr)
        model = load_mura_model()
        print("Model loaded, starting prediction...", file=sys.stderr)
        
        # Make prediction
        result = predict_fracture(image_path, model)
        print("Prediction completed", file=sys.stderr)
        
        # Print the result as JSON to stdout only (no stderr)
        output = json.dumps(result)
        # Ensure output goes to stdout
        sys.stdout.write(output)
        sys.stdout.write('\n')
        sys.stdout.flush()
        print("Output sent to stdout", file=sys.stderr)
        
    except FileNotFoundError as e:
        # Model file not found
        error_result = json.dumps({"error": f"Model file not found: {str(e)}"})
        print(error_result, file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)
    except Exception as e:
        # Any other error - send to stderr as JSON
        import traceback
        error_msg = str(e)
        error_details = {
            "error": error_msg,
            "type": type(e).__name__
        }
        # Print error as JSON to stderr
        error_result = json.dumps(error_details)
        print(error_result, file=sys.stderr)
        sys.stderr.flush()
        # Also print traceback to stderr for debugging (not as JSON)
        print("\nTraceback:", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)
