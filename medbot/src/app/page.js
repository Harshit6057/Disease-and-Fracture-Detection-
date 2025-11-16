'use client'
import React, { useState, useRef ,useEffect} from 'react';
import { MessageCircle, User, Upload, FileText, Send, Moon, Home, BarChart3, Settings, History, FileSearch } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ChestXrayReport() {
  const { user, logout } = useAuth();
  const [userRole, setUserRole] = useState('doctor'); // 'doctor' or 'patient'
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [question, setQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      type: 'assistant',
      text: 'Welcome! Ask me about the findings, impression, or specific details in the report above.'
    }
  ]);
  const [imageURL, setImageURL] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (currentPage === 'history' && user) {
      const fetchReports = async () => {
        try {
          const response = await fetch('/api/reports');
          if (response.ok) {
            const data = await response.json();
            setReports(data);
          } else {
            console.error('Failed to fetch reports');
          }
        } catch (error) {
          console.error('Error fetching reports:', error);
        }
      };
      fetchReports();
    }
  }, [currentPage, user]);

  const handleSaveReport = async () => {
    if (!prediction || !imageURL || !user) {
      alert('No prediction or user not logged in to save report.');
      return;
    }

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          predictedClass: prediction.predicted_class,
          confidenceScore: prediction.probabilities[['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity'].indexOf(prediction.predicted_class)],
          imageURL: imageURL,
        }),
      });

      if (response.ok) {
        alert('Report saved successfully!');
      } else {
        const errorData = await response.json();
        alert(`Failed to save report: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('Error saving report:', error);
      alert('Error saving report.');
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setLoading(true);
      setPrediction(null);
      setImageURL(URL.createObjectURL(file));

      const formData = new FormData();
      formData.append('image', file);

      try {
        const response = await fetch('/api/predict', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          setPrediction(data);
        } else {
          console.error('Failed to get prediction');
        }
      } catch (error) {
        console.error('Error uploading image:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const exampleQuestions = [
    'What are the main findings?',
    'Are there any tubes or lines mentioned?',
    'Summarize the impression',
    'Is the heart size normal?',
    'Any signs of pleural effusion?'
  ];

  const handleQuestionClick = (q) => {
    setQuestion(q);
  };

  const handleSendQuestion = async () => {
    if (question.trim() && prediction) {
      const newMessages = [...chatMessages, { type: 'user', text: question }];
      setChatMessages(newMessages);
      setQuestion('');

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: question,
            context: prediction,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setChatMessages(prev => [...prev, { type: 'assistant', text: data.answer }]);
        } else {
          console.error('Failed to get answer from chatbot');
          setChatMessages(prev => [...prev, { type: 'assistant', text: 'Sorry, I am having trouble responding right now.' }]);
        }
      } catch (error) {
        console.error('Error sending question:', error);
        setChatMessages(prev => [...prev, { type: 'assistant', text: 'Sorry, I am having trouble responding right now.' }]);
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendQuestion();
    }
  };

  const doctorNavItems = [
    { id: 'dashboard', name: 'Dashboard', icon: Home },
    { id: 'new-report', name: 'New Report', icon: FileSearch },
    { id: 'history', name: 'History', icon: History },
    { id: 'analytics', name: 'Analytics', icon: BarChart3 },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  const patientNavItems = [
    { id: 'new-report', name: 'My Report', icon: FileSearch },
    { id: 'history', name: 'My Reports', icon: History },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  const navItems = userRole === 'doctor' ? doctorNavItems : patientNavItems;

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.9) {
      return "text-green-600";
    } else if (confidence >= 0.7) {
      return "text-yellow-600";
    } else {
      return "text-red-600";
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        if (userRole === 'patient') {
          setCurrentPage('new-report');
          return null;
        }
        return (
          <div className="p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h2>
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Total Reports</h3>
                <p className="text-4xl font-bold text-blue-600">247</p>
                <p className="text-sm text-gray-600 mt-2">+12 this week</p>
              </div>
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-green-900 mb-2">Pending Review</h3>
                <p className="text-4xl font-bold text-green-600">8</p>
                <p className="text-sm text-gray-600 mt-2">3 urgent cases</p>
              </div>
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-purple-900 mb-2">Completed</h3>
                <p className="text-4xl font-bold text-purple-600">239</p>
                <p className="text-sm text-gray-600 mt-2">96.8% accuracy</p>
              </div>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-gray-900">Patient #12847 - Chest X-ray</p>
                    <p className="text-sm text-gray-600">Completed 2 hours ago</p>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">Completed</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-gray-900">Patient #12846 - Chest X-ray</p>
                    <p className="text-sm text-gray-600">Completed 5 hours ago</p>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">Completed</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-gray-900">Patient #12845 - Chest X-ray</p>
                    <p className="text-sm text-gray-600">Pending review</p>
                  </div>
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">Pending</span>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'history':
        return (
          <div className="p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              {userRole === 'doctor' ? 'Report History' : 'My Reports'}
            </h2>
            <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    {userRole === 'doctor' && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Patient ID</th>}
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reports.length > 0 ? (
                    reports.map((report) => (
                      <tr key={report._id} className="hover:bg-gray-50">
                        {userRole === 'doctor' && <td className="px-6 py-4 text-sm text-gray-900">{report.userId}</td>}
                        <td className="px-6 py-4 text-sm text-gray-600">{new Date(report.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{report.predictedClass}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(report.confidenceScore)}`}>
                            {(report.confidenceScore * 100).toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">View Report</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={userRole === 'doctor' ? 5 : 4} className="px-6 py-4 text-center text-gray-500">
                        No reports found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'analytics':
        if (userRole === 'patient') {
          setCurrentPage('new-report');
          return null;
        }
        return (
          <div className="p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Analytics</h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Reports by Month</h3>
                <div className="h-64 flex items-end justify-around gap-2">
                  {[65, 45, 80, 70, 90, 75].map((height, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-blue-500 rounded-t" style={{ height: `${height}%` }}></div>
                      <span className="text-xs text-gray-600 mt-2">M{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Report Types</h3>
                <div className="space-y-4 mt-8">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">Chest X-ray</span>
                      <span className="text-sm font-medium text-gray-700">78%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className="bg-blue-500 h-3 rounded-full" style={{ width: '78%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">CT Scan</span>
                      <span className="text-sm font-medium text-gray-700">15%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className="bg-green-500 h-3 rounded-full" style={{ width: '15%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">MRI</span>
                      <span className="text-sm font-medium text-gray-700">7%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className="bg-purple-500 h-3 rounded-full" style={{ width: '7%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Settings</h2>
            <div className="bg-white border-2 border-gray-200 rounded-lg p-6 max-w-2xl">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Settings</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" 
                        placeholder={userRole === 'doctor' ? 'Dr. John Smith' : 'Alice Miller'} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input 
                        type="email" 
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" 
                        placeholder={userRole === 'doctor' ? 'john.smith@hospital.com' : 'alice.miller@email.com'} 
                      />
                    </div>
                  </div>
                </div>
                <div className="border-t-2 border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Preferences</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-5 h-5" defaultChecked />
                      <span className="text-sm text-gray-700">Enable email notifications</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-5 h-5" defaultChecked />
                      <span className="text-sm text-gray-700">Auto-save reports</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-5 h-5" />
                      <span className="text-sm text-gray-700">Dark mode</span>
                    </label>
                  </div>
                </div>
                <button className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        );

      case 'new-report':
      default:
        return (
          <div className="h-full bg-gray-100 p-6 flex items-center justify-center overflow-y-hidden">
            <div className="w-full h-full bg-white rounded-xl shadow-lg border-2 border-blue-500 overflow-hidden flex flex-col">
              {/* Header */}
              <div className="bg-white px-6 py-4 flex items-center justify-between border-b-2 border-gray-200">
                <h1 className="text-2xl font-bold text-blue-600">
                  X-ray Report Generation
                </h1>
                <button className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition">
                  <Moon className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-0 flex-1 overflow-hidden">
                {/* Left Panel - Chat */}
                <div className="flex flex-col h-full border-r-2 border-gray-200">
                  {/* Chat Header */}
                  <div className="bg-white border-b-2 border-gray-200 px-6 py-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900">
                      <MessageCircle className="w-5 h-5" />
                      Chat about Report
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Ask questions based *only* on the generated report
                    </p>
                  </div>

                  {/* Chat Messages */}
                  <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`mb-4 ${
                          msg.type === 'user' ? 'flex justify-end' : ''
                        }`}
                      >
                        <div
                          className={`p-4 rounded-lg text-base max-w-[90%] ${
                            msg.type === 'assistant'
                              ? 'bg-gray-200 text-gray-900'
                              : 'bg-blue-500 text-white'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Input Area */}
                  <div className="border-t-2 border-gray-200 p-6 bg-white">
                    <div className="flex gap-3 mb-4">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your question..."
                        className="flex-1 px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={handleSendQuestion}
                        className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full transition"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Example Questions */}
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-2">Example Questions:</p>
                      <div className="flex flex-wrap gap-2">
                        {exampleQuestions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleQuestionClick(q)}
                            className="px-3 py-1.5 text-sm bg-white text-blue-600 rounded-full hover:bg-blue-50 transition border border-blue-300"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Panel - Image and Report */}
                <div className="flex flex-col h-full bg-white">
                  {/* Patient Info */}
                  <div className="border-b-2 border-gray-200 px-6 py-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 mb-2">
                      <User className="w-5 h-5" />
                      Patient Information
                    </h2>
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">View:</span> Frontal-AP | <span className="font-medium">Age:</span> 31 | <span className="font-medium">Gender:</span> Male | <span className="font-medium">Ethnicity:</span> White
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 gap-6 mb-6">
                      {/* Uploaded Image Section */}
                      <div>
                        <h3 className="text-base font-semibold flex items-center gap-2 mb-3 text-gray-900">
                          <Upload className="w-5 h-5" />
                          Uploaded Image
                        </h3>
                        <div className="bg-white rounded-lg overflow-hidden relative mb-3 flex justify-center items-center h-64 border-2 border-gray-300 ">
                          {imageURL ? (
                            <>
                              <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 text-xs font-medium">
                                SEMI-UPRIGHT
                              </div>
                              <img
                                src={imageURL}
                                alt="Chest X-ray"
                                className="w-full h-auto"
                                style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}
                              />
                            </>
                          ) : (
                            <button
                              onClick={() => fileInputRef.current.click()}
                              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition flex items-center gap-2"
                            >
                              <Upload className="w-5 h-5" />
                              Upload Image
                            </button>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 text-center mb-2">
                            Hover over image to zoom (on desktop)
                          </p>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Zoom Level: {zoomLevel.toFixed(1)}x</span>
                            <input
                              type="range"
                              min="1"
                              max="3"
                              step="0.1"
                              value={zoomLevel}
                              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                              className="flex-1"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Generated Report Section */}
                      <div>
                        <h3 className="text-base font-semibold flex items-center gap-2 mb-3 text-gray-900">
                          <FileText className="w-5 h-5" />
                          Generated Report
                        </h3>
                        <div className="bg-white rounded-lg border-2 border-gray-300 p-4 text-sm text-gray-800 leading-relaxed min-h-[250px]">
                          {loading ? (
                            <div className="flex justify-center items-center h-full">
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                            </div>
                          ) : prediction ? (
                            <div>
                              <p className="text-lg font-semibold mb-2">
                                Predicted Class:{" "}
                                <span className="text-blue-600">{prediction.predicted_class}</span>
                              </p>
                              <p className="mb-4">
                                Confidence Score:{" "}
                                <span
                                  className={`font-semibold ${getConfidenceColor(
                                    prediction.probabilities[
                                      ['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity'].indexOf(prediction.predicted_class)
                                    ]
                                  )}`}
                                >
                                  {(
                                    prediction.probabilities[
                                      ['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity'].indexOf(prediction.predicted_class)
                                    ] * 100
                                  ).toFixed(2)}
                                  %
                                </span>
                              </p>
                              <div className="text-sm">
                                <p className="font-semibold mb-2">Summary of Findings:</p>
                                <p>
                                  The model predicts the presence of{" "}
                                  <span className="font-semibold">{prediction.predicted_class}</span> with a high
                                  degree of confidence. This suggests that the X-ray may show signs
                                  consistent with this condition.
                                </p>
                                <br />
                                <p>
                                  For a definitive diagnosis, please consult a qualified
                                  radiologist.
                                </p>
                              </div>
                              {user && (
                                <button
                                  onClick={handleSaveReport}
                                  className="mt-4 w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
                                >
                                  <FileText className="w-4 h-4" />
                                  Save Report
                                </button>
                              )}
                            </div>
                          ) : (
                            'Upload an image to get a prediction.'
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Start Over Button */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      className="hidden"
                      accept="image/*"
                      data-testid="file-input"
                    />
                    {imageURL && (
                      <button
                        onClick={() => fileInputRef.current.click()}
                        className="w-full py-3 border-2 border-gray-300 rounded-lg text-base text-gray-700 font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Start Over / New Image
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-screen bg-gray-100 flex">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-blue-600 text-white flex flex-col">
        <div className="p-6 border-b border-blue-500">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileSearch className="w-6 h-6" />
            MEDBOT
          </h1>
          {/* Role Toggle */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                setUserRole('doctor');
                setCurrentPage('dashboard');
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                userRole === 'doctor'
                  ? 'bg-white text-blue-600'
                  : 'bg-blue-500 text-white hover:bg-blue-400'
              }`}
            >
              Doctor
            </button>
            <button
              onClick={() => {
                setUserRole('patient');
                setCurrentPage('new-report');
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                userRole === 'patient'
                  ? 'bg-white text-blue-600'
                  : 'bg-blue-500 text-white hover:bg-blue-400'
              }`}
            >
              Patient
            </button>
          </div>
        </div>
        <nav className="flex-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition ${
                  currentPage === item.id
                    ? 'bg-blue-700 text-white font-semibold'
                    : 'text-blue-100 hover:bg-blue-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-blue-500">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center font-semibold">
              {userRole === 'doctor' ? 'JS' : 'AM'}
            </div>
            <div>
              <p className="font-medium text-sm">
                {userRole === 'doctor' ? 'Dr. John Smith' : 'Alice Miller'}
              </p>
              <p className="text-xs text-blue-200">
                {userRole === 'doctor' ? 'Radiologist' : 'Patient'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="bg-white px-6 py-4 flex items-center justify-between border-b-2 border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {navItems.find(item => item.id === currentPage)?.name || 'X-ray Report Generation'}
          </h2>
          <div className="flex items-center gap-4">
            {user ? (
              <button onClick={logout} className="text-blue-600 hover:text-blue-700 font-medium">Logout</button>
            ) : (
              <a href="/login" className="text-blue-600 hover:text-blue-700 font-medium">Login</a>
            )}
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          {renderPage()}
        </div>
      </div>
    </div>
  );
}