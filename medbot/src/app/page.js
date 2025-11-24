'use client'
import React, { useState, useRef ,useEffect, useCallback} from 'react';
import { MessageCircle, User, Upload, FileText, Send, Moon, Sun, Home, BarChart3, Settings, History, FileSearch } from 'lucide-react';

const initializeMonthBuckets = () => {
  const now = new Date();
  return Array.from({ length: 6 }).map((_, idx) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    return {
      label: date.toLocaleString('default', { month: 'short' }),
      month: date.getMonth(),
      year: date.getFullYear(),
      count: 0,
    };
  });
};
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
  const [reportType, setReportType] = useState('chest'); // 'chest' or 'fracture'
  const [dashboardStats, setDashboardStats] = useState({
    totalReports: 0,
    pendingReview: 0,
    completedReports: 0,
    newThisWeek: 0,
    recentActivity: [],
  });
  const [reportTypeCounts, setReportTypeCounts] = useState({
    chest: 0,
    fracture: 0,
  });
  const [reportsByMonth, setReportsByMonth] = useState(initializeMonthBuckets());
  const [isFetchingReports, setIsFetchingReports] = useState(false);
  const [theme, setTheme] = useState('light');
  const [selectedReport, setSelectedReport] = useState(null);
  const fileInputRef = useRef(null);
  const updateReportAggregates = useCallback((data = []) => {
    const totalReports = data.length;
    const pendingReview = data.filter((report) => {
      const status = (report?.status || report?.reviewStatus || '').toString().toLowerCase();
      return status.includes('pending');
    }).length;
    const completedReports = totalReports - pendingReview;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newThisWeek = data.filter((report) => {
      if (!report?.createdAt) return false;
      const created = new Date(report.createdAt);
      return !Number.isNaN(created.getTime()) && created >= weekAgo;
    }).length;
    const recentActivity = [...data]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 3);

    setDashboardStats({
      totalReports,
      pendingReview,
      completedReports,
      newThisWeek,
      recentActivity,
    });

    const typeCounts = data.reduce(
      (acc, report) => {
        const type = report?.reportType === 'fracture' ? 'fracture' : 'chest';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      { chest: 0, fracture: 0 }
    );
    setReportTypeCounts({
      chest: typeCounts.chest || 0,
      fracture: typeCounts.fracture || 0,
    });

    const monthBuckets = initializeMonthBuckets();
    data.forEach((report) => {
      if (!report?.createdAt) return;
      const created = new Date(report.createdAt);
      const bucket = monthBuckets.find(
        (item) => item.month === created.getMonth() && item.year === created.getFullYear()
      );
      if (bucket) {
        bucket.count += 1;
      }
    });
    setReportsByMonth(monthBuckets);
  }, []);
  const fetchReports = useCallback(async () => {
    if (!user) {
      setReports([]);
      updateReportAggregates([]);
      return;
    }

    setIsFetchingReports(true);
    try {
      const response = await fetch('/api/reports');
      if (response.ok) {
        const data = await response.json();
        setReports(data);
        updateReportAggregates(data);
      } else {
        console.error('Failed to fetch reports');
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setIsFetchingReports(false);
    }
  }, [updateReportAggregates, user]);

  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem('medbot-theme');
      if (storedTheme) {
        setTheme(storedTheme);
      }
    } catch (error) {
      console.warn('Unable to read theme from storage', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('medbot-theme', theme);
    } catch (error) {
      console.warn('Unable to persist theme', error);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme === 'dark' ? '#0f172a' : '#f5f7fb';
      document.body.style.color = theme === 'dark' ? '#e2e8f0' : '#0f172a';
    }
  }, [theme]);

  useEffect(() => {
    if (user) {
      fetchReports();
    }
  }, [user, fetchReports]);

  useEffect(() => {
    if (currentPage === 'history' && user) {
      fetchReports();
    }
  }, [currentPage, user, fetchReports]);

  const handleSaveReport = async () => {
    if (!prediction || !imageURL || !user) {
      alert('No prediction or user not logged in to save report.');
      return;
    }

    try {
      const predType = prediction.reportType || reportType;
      const chestClasses = ['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity'];
      const muraClasses = ['XR_ELBOW', 'XR_FINGER', 'XR_FOREARM', 'XR_HAND', 'XR_HUMERUS', 'XR_SHOULDER', 'XR_WRIST'];
      
      let confidenceScore;
      if (predType === 'chest') {
        const classIndex = chestClasses.indexOf(prediction.predicted_class);
        confidenceScore = classIndex >= 0 ? prediction.probabilities[classIndex] : prediction.probabilities[0];
      } else {
        const classIndex = muraClasses.indexOf(prediction.predicted_class);
        confidenceScore = classIndex >= 0 ? prediction.probabilities[classIndex] : prediction.probabilities[0];
      }

      const reportData = {
        reportType: predType,
        predictedClass: prediction.predicted_class,
        confidenceScore: confidenceScore,
        imageURL: imageURL,
      };

      if (predType === 'fracture' && prediction.fractureLocation) {
        reportData.fractureLocation = prediction.fractureLocation;
      }

      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportData),
      });

      if (response.ok) {
        alert('Report saved successfully!');
        await fetchReports();
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
      // Check if user is logged in
      if (!user) {
        alert('Please login to use this feature. Redirecting to login page...');
        window.location.href = '/login';
        return;
      }

      setLoading(true);
      setPrediction(null);
      setImageURL(URL.createObjectURL(file));

      const formData = new FormData();
      formData.append('image', file);
      formData.append('reportType', reportType);

      try {
        // Use smart prediction that auto-detects image type
        // Cookies are sent automatically with fetch requests
        const response = await fetch('/api/predict-smart', {
          method: 'POST',
          credentials: 'include', // Ensure cookies are sent
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          setPrediction(data);
          
          // Auto-update reportType based on detected type
          // Update image URL to match the saved filename if provided
          if (data.imageURL) {
            setImageURL(data.imageURL);
          }
          
          // Reset chat messages when new prediction is made
          setChatMessages([
            {
              type: 'assistant',
              text: data.reportType === 'fracture' 
                ? 'Welcome! Ask me about the fracture location, findings, or specific details in the report above.'
                : 'Welcome! Ask me about the findings, impression, or specific details in the report above.'
            }
          ]);
        } else {
          let errorMessage = `Failed to get prediction (Status: ${response.status})`;
          let shouldRedirect = false;
          try {
            // Try to get error message from response
            const text = await response.text();
            if (text) {
              try {
                const errorData = JSON.parse(text);
                errorMessage = errorData.details || errorData.error || errorMessage;
                console.error('Failed to get prediction:', errorData);
                
                // Check if token expired or invalid
                if (response.status === 401 || errorData.code === 'TOKEN_EXPIRED' || errorData.code === 'INVALID_TOKEN') {
                  shouldRedirect = true;
                  errorMessage = 'Your session has expired. Please login again.';
                }
              } catch (parseError) {
                // Not JSON, use text as error message if it's meaningful
                if (text.trim().length > 0 && text.length < 500) {
                  errorMessage = text.trim();
                } else {
                  errorMessage = `Server returned error (${response.status}): ${response.statusText || 'Unknown error'}`;
                }
                console.error('Response was not JSON:', text.substring(0, 200));
              }
            } else {
              errorMessage = `Server error (${response.status}): ${response.statusText || 'No response from server'}`;
            }
          } catch (error) {
            console.error('Error reading error response:', error);
            errorMessage = `Network error: ${error.message || 'Could not connect to server'}`;
          }
          
          alert(errorMessage);
          setLoading(false);
          
          // Redirect to login if token expired
          if (shouldRedirect || response.status === 401) {
            setTimeout(() => {
              window.location.href = '/login';
            }, 1000);
          }
        }
      } catch (error) {
        console.error('Error uploading image:', error);
        alert(`Error uploading image: ${error.message || 'Please try again.'}`);
        setLoading(false);
      } finally {
        setLoading(false);
      }
    }
  };

  const getExampleQuestions = () => {
    if (reportType === 'fracture') {
      return [
        'What is the fracture location?',
        'What are the main findings?',
        'Describe the fracture in detail',
        'What is the confidence level?',
        'Any recommendations for treatment?'
      ];
    }
    return [
      'What are the main findings?',
      'Are there any tubes or lines mentioned?',
      'Summarize the impression',
      'Is the heart size normal?',
      'Any signs of pleural effusion?'
    ];
  };

  const exampleQuestions = getExampleQuestions();

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
  const isDarkMode = theme === 'dark';
  const surfaceClass = isDarkMode ? 'bg-gray-800 border border-gray-700 text-gray-100' : 'bg-white border-2 border-gray-200 text-gray-900';
  const mutedTextClass = isDarkMode ? 'text-gray-300' : 'text-gray-600';
  const softSurfaceClass = isDarkMode ? 'bg-gray-900 border border-gray-800' : 'bg-gray-50 border border-gray-200';
  const panelBackgroundClass = isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  const pageBackgroundClass = isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900';
  const dividerClass = isDarkMode ? 'border-gray-800' : 'border-gray-200';
  const inputBaseClasses = isDarkMode
    ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder:text-gray-400'
    : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-500';
  const totalTypeCount = Math.max(reportTypeCounts.chest + reportTypeCounts.fracture, 0);
  const reportTypeSummary = [
    {
      label: 'Chest X-ray',
      value: reportTypeCounts.chest,
      percent: totalTypeCount ? Math.round((reportTypeCounts.chest / totalTypeCount) * 100) : 0,
      barColor: 'bg-blue-500',
    },
    {
      label: 'Fracture',
      value: reportTypeCounts.fracture,
      percent: totalTypeCount ? Math.round((reportTypeCounts.fracture / totalTypeCount) * 100) : 0,
      barColor: 'bg-orange-400',
    },
  ];
  const maxMonthlyCount = Math.max(...reportsByMonth.map((bucket) => bucket.count || 0), 1);
  const closeReportModal = () => setSelectedReport(null);
  const getConfidencePercent = (report) => {
    if (!report?.confidenceScore && report?.confidenceScore !== 0) return 'N/A';
    return `${(report.confidenceScore * 100).toFixed(2)}%`;
  };

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
          <div className="p-8 space-y-8">
            <div>
              <h2 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Dashboard</h2>
              <p className={`${mutedTextClass}`}>Live summary of every report generated through MEDBOT.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`${surfaceClass} rounded-lg p-6`}>
                <h3 className="text-lg font-semibold mb-2">Total Reports</h3>
                <p className="text-4xl font-bold text-blue-400">{dashboardStats.totalReports}</p>
                <p className={`text-sm mt-2 ${mutedTextClass}`}>+{dashboardStats.newThisWeek} this week</p>
              </div>
              <div className={`${surfaceClass} rounded-lg p-6`}>
                <h3 className="text-lg font-semibold mb-2">Pending Review</h3>
                <p className="text-4xl font-bold text-yellow-400">{dashboardStats.pendingReview}</p>
                <p className={`text-sm mt-2 ${mutedTextClass}`}>Awaiting manual confirmation</p>
              </div>
              <div className={`${surfaceClass} rounded-lg p-6`}>
                <h3 className="text-lg font-semibold mb-2">Completed</h3>
                <p className="text-4xl font-bold text-green-400">{dashboardStats.completedReports}</p>
                <p className={`text-sm mt-2 ${mutedTextClass}`}>
                  {dashboardStats.totalReports
                    ? `${Math.round((dashboardStats.completedReports / Math.max(dashboardStats.totalReports, 1)) * 100)}% of total`
                    : 'Run a study to see stats'}
                </p>
              </div>
            </div>
            <div className={`${surfaceClass} rounded-lg p-6`}>
              <h3 className="text-xl font-semibold mb-4">Recent Activity</h3>
              {dashboardStats.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {dashboardStats.recentActivity.map((report) => {
                    const isPending = (report?.status || report?.reviewStatus || '').toLowerCase().includes('pending');
                    const statusLabel = report?.status || report?.reviewStatus || (isPending ? 'Pending' : 'Completed');
                    return (
                      <div
                        key={report?._id || report?.createdAt}
                        className={`flex items-center justify-between p-3 rounded ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
                      >
                        <div>
                          <p className="font-medium">
                            {report?.reportType === 'fracture' ? 'Fracture Study' : 'Chest X-ray'} ·{' '}
                            {report?.predictedClass || report?.fractureLocation || 'Prediction pending'}
                          </p>
                          <p className={`text-sm ${mutedTextClass}`}>
                            {report?.createdAt ? new Date(report.createdAt).toLocaleString() : 'Timestamp unavailable'}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            isPending
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={mutedTextClass}>No reports yet. Generate a new report to see live activity.</p>
              )}
            </div>
          </div>
        );
      
      case 'history':
        return (
          <div className="p-8 space-y-6">
            <h2 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {userRole === 'doctor' ? 'Report History' : 'My Reports'}
            </h2>
            <p className={mutedTextClass}>Every study you generate lands here for quick review and download.</p>
            <div className={`${surfaceClass} rounded-lg overflow-hidden`}>
              <table className="w-full">
                <thead className={`${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b-2`}>
                  <tr>
                    {userRole === 'doctor' && <th className="px-6 py-3 text-left text-sm font-semibold">Patient ID</th>}
                    <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Report Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Prediction</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-gray-800' : 'divide-gray-200'}`}>
                  {reports.length > 0 ? (
                    reports.map((report) => (
                      <tr key={report._id} className={isDarkMode ? 'hover:bg-gray-900' : 'hover:bg-gray-50'}>
                        {userRole === 'doctor' && <td className="px-6 py-4 text-sm">{report.userId}</td>}
                        <td className={`px-6 py-4 text-sm ${mutedTextClass}`}>{new Date(report.createdAt).toLocaleDateString()}</td>
                        <td className={`px-6 py-4 text-sm ${mutedTextClass}`}>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            report.reportType === 'fracture' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {report.reportType === 'fracture' ? 'Fracture' : 'Chest X-ray'}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-sm ${mutedTextClass}`}>
                          {report.reportType === 'fracture' && report.fractureLocation ? (
                            <div>
                              <div className="font-medium">{report.fractureLocation.replace('XR_', '').replace('_', ' ')}</div>
                              <div className={`text-xs ${mutedTextClass}`}>{report.predictedClass}</div>
                            </div>
                          ) : (
                            report.predictedClass
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(report.confidenceScore)}`}>
                            {(report.confidenceScore * 100).toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setSelectedReport(report)}
                            className="text-blue-400 hover:text-blue-300 font-medium text-sm underline-offset-2 hover:underline"
                          >
                            View Report
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={userRole === 'doctor' ? 6 : 5} className={`px-6 py-4 text-center ${mutedTextClass}`}>
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
          <div className="p-8 space-y-8">
            <div>
              <h2 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Analytics</h2>
              <p className={mutedTextClass}>Auto-updated insights from the latest chest and fracture studies.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={`${surfaceClass} rounded-lg p-6`}>
                <h3 className="text-xl font-semibold mb-4">Reports by Month</h3>
                <div className="h-64 flex items-end justify-between gap-3">
                  {reportsByMonth.map((bucket) => (
                    <div key={`${bucket.year}-${bucket.month}`} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-blue-500 rounded-t transition-all duration-300"
                        style={{ height: `${(bucket.count / Math.max(maxMonthlyCount, 1)) * 100}%` }}
                      ></div>
                      <span className={`text-xs mt-2 ${mutedTextClass}`}>{bucket.label}</span>
                      <span className={`text-xs ${mutedTextClass}`}>{bucket.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`${surfaceClass} rounded-lg p-6`}>
                <h3 className="text-xl font-semibold mb-4">Report Types</h3>
                {totalTypeCount ? (
                  <div className="space-y-4">
                    {reportTypeSummary.map((type) => (
                      <div key={type.label}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">{type.label}</span>
                          <span className="text-sm font-medium">{type.percent}% ({type.value})</span>
                        </div>
                        <div className={`w-full ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-full h-3 overflow-hidden`}>
                          <div className={`${type.barColor} h-3 rounded-full`} style={{ width: `${type.percent}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={mutedTextClass}>Generate a report to populate this chart.</p>
                )}
              </div>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="p-8 space-y-6">
            <h2 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Settings</h2>
            <p className={mutedTextClass}>Tweak your profile, notifications, and display preferences.</p>
            <div className={`${surfaceClass} rounded-lg p-6 max-w-2xl`}>
              <div className="space-y-6">
                <div>
                  <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Profile Settings</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Full Name</label>
                      <input 
                        type="text" 
                        className={`w-full px-4 py-2 border-2 rounded-lg focus:outline-none focus:border-blue-500 ${inputBaseClasses}`} 
                        placeholder={userRole === 'doctor' ? 'Dr. John Smith' : 'Alice Miller'} 
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Email</label>
                      <input 
                        type="email" 
                        className={`w-full px-4 py-2 border-2 rounded-lg focus:outline-none focus:border-blue-500 ${inputBaseClasses}`} 
                        placeholder={userRole === 'doctor' ? 'john.smith@hospital.com' : 'alice.miller@email.com'} 
                      />
                    </div>
                  </div>
                </div>
                <div className={`border-t-2 pt-6 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Preferences</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-5 h-5" defaultChecked />
                      <span className={`text-sm ${mutedTextClass}`}>Enable email notifications</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-5 h-5" defaultChecked />
                      <span className={`text-sm ${mutedTextClass}`}>Auto-save reports</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="w-5 h-5"
                        checked={isDarkMode}
                        onChange={() => setTheme(isDarkMode ? 'light' : 'dark')}
                      />
                      <span className={`text-sm ${mutedTextClass}`}>Dark mode</span>
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
          <div className={`${pageBackgroundClass} p-6 flex flex-col min-h-full`}>
            <div className={`w-full rounded-xl shadow-lg border-2 border-blue-500 overflow-hidden flex flex-col min-h-0 ${panelBackgroundClass}`}>
              {/* Header */}
              <div className={`px-6 py-4 flex items-center justify-between border-b-2 ${dividerClass}`}>
                <h1 className="text-2xl font-bold text-blue-400">
                  X-ray Report Generation
                </h1>
                <div className="flex items-center gap-4">
                  {/* Report Type Selector */}
                  <div className={`flex gap-2 rounded-lg p-1 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <button
                      onClick={() => {
                        setReportType('chest');
                        setPrediction(null);
                        setImageURL(null);
                        setChatMessages([
                          {
                            type: 'assistant',
                            text: 'Welcome! Ask me about the findings, impression, or specific details in the report above.'
                          }
                        ]);
                      }}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                        reportType === 'chest'
                          ? 'bg-blue-500 text-white'
                          : isDarkMode
                            ? 'text-gray-200 hover:bg-gray-800'
                            : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Chest X-ray
                    </button>
                    <button
                      onClick={() => {
                        setReportType('fracture');
                        setPrediction(null);
                        setImageURL(null);
                        setChatMessages([
                          {
                            type: 'assistant',
                            text: 'Welcome! Ask me about the fracture location, findings, or specific details in the report above.'
                          }
                        ]);
                      }}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                        reportType === 'fracture'
                          ? 'bg-blue-500 text-white'
                          : isDarkMode
                            ? 'text-gray-200 hover:bg-gray-800'
                            : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Fracture Detection
                    </button>
                  </div>
                  {prediction && prediction.reportType && (
                    <div
                      className={`text-xs px-3 py-1 rounded-full border ${
                        isDarkMode
                          ? 'text-green-200 bg-green-900/30 border-green-600'
                          : 'text-gray-600 bg-green-50 border-green-200'
                      }`}
                    >
                      Auto-detected: {prediction.reportType === 'fracture' ? 'Fracture' : 'Chest X-ray'}
                    </div>
                  )}
                  <button
                    onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
                    className={`p-2 rounded-full transition ${
                      isDarkMode ? 'bg-gray-800 text-yellow-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    aria-label="Toggle theme"
                  >
                    {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-0 flex-1 min-h-0">
                {/* Left Panel - Chat */}
                <div className={`flex flex-col h-full min-h-0 border-r-2 ${dividerClass}`}>

                  {/* Chat Header */}
                  <div className={`px-6 py-3 border-b-2 ${dividerClass}`}>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <MessageCircle className="w-5 h-5" />
                      Chat about Report
                    </h2>
                    <p className={`text-sm mt-1 ${mutedTextClass}`}>
                      Ask questions based *only* on the generated report. Image type is auto-detected.
                    </p>
                  </div>

                  {/* Chat Messages */}
                  <div className={`flex-1 min-h-0 overflow-y-auto p-6 ${isDarkMode ? 'bg-gray-900/60' : 'bg-gray-50'}`}>

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
                              ? isDarkMode
                                ? 'bg-gray-800 text-gray-100'
                                : 'bg-gray-200 text-gray-900'
                              : 'bg-blue-500 text-white'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Input Area */}
                  <div className={`border-t-2 p-6 ${dividerClass}`}>
                    <div className="flex gap-3 mb-4">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your question..."
                        className={`flex-1 px-4 py-3 text-base border-2 rounded-lg focus:outline-none focus:border-blue-500 ${inputBaseClasses}`}
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
                      <p className={`text-sm font-medium mb-2 ${mutedTextClass}`}>Example Questions:</p>
                      <div className="flex flex-wrap gap-2">
                        {exampleQuestions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleQuestionClick(q)}
                            className={`px-3 py-1.5 text-sm rounded-full transition border ${isDarkMode ? 'bg-gray-800 text-blue-200 border-blue-500 hover:bg-gray-700' : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'}`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Panel - Image and Report */}
                <div className={`flex flex-col h-full min-h-0 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
                  {/* Patient Info */}
                  <div className={`border-b-2 px-6 py-3 ${dividerClass}`}>
                    <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
                      <User className="w-5 h-5" />
                      Patient Information
                    </h2>
                    <div className={`text-sm ${mutedTextClass}`}>
                      <span className="font-medium">View:</span> Frontal-AP | <span className="font-medium">Age:</span> 31 | <span className="font-medium">Gender:</span> Male | <span className="font-medium">Ethnicity:</span> White
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 gap-6 mb-6">
                      {/* Uploaded Image Section */}
                      <div>
                        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                          <Upload className="w-5 h-5" />
                          Uploaded Image
                        </h3>
                        <div className={`rounded-lg overflow-hidden relative mb-3 flex justify-center items-center h-64 border-2 ${isDarkMode ? 'bg-gray-950 border-gray-700' : 'bg-white border-gray-300'}`}>
                          {imageURL ? (
                            <>
                              <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 text-xs font-medium">
                                {reportType === 'fracture' ? 'FRACTURE X-RAY' : 'SEMI-UPRIGHT'}
                              </div>
                              <img
                                src={imageURL}
                                alt={reportType === 'fracture' ? 'Fracture X-ray' : 'Chest X-ray'}
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
                          <p className={`text-xs text-center mb-2 ${mutedTextClass}`}>
                            Hover over image to zoom (on desktop)
                          </p>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-medium whitespace-nowrap ${mutedTextClass}`}>Zoom Level: {zoomLevel.toFixed(1)}x</span>
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
                        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                          <FileText className="w-5 h-5" />
                          Generated Report
                        </h3>
                        <div className={`rounded-lg border-2 p-4 text-sm leading-relaxed min-h-[250px] ${isDarkMode ? 'bg-gray-950 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}>
                          {loading ? (
                            <div className="flex justify-center items-center h-full">
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                            </div>
                          ) : prediction ? (
                            <div>
                              <p className="text-lg font-semibold mb-2">
                                {prediction.reportType === 'fracture' ? 'Fracture Location' : 'Predicted Class'}:{" "}
                                <span className="text-blue-600">
                                  {prediction.reportType === 'fracture' 
                                    ? prediction.fractureLocation || prediction.predicted_class
                                    : prediction.predicted_class}
                                </span>
                              </p>
                              {prediction.reportType === 'fracture' && prediction.fractureLocation && (
                              <p className={`text-sm mb-2 ${mutedTextClass}`}>
                                  Body Part: <span className="font-medium">{prediction.fractureLocation.replace('XR_', '').replace('_', ' ')}</span>
                                </p>
                              )}
                              <p className="mb-4">
                                Confidence Score:{" "}
                                <span
                                  className={`font-semibold ${getConfidenceColor(
                                    (() => {
                                      const predType = prediction.reportType || reportType;
                                      if (predType === 'fracture') {
                                        const muraClasses = ['XR_ELBOW', 'XR_FINGER', 'XR_FOREARM', 'XR_HAND', 'XR_HUMERUS', 'XR_SHOULDER', 'XR_WRIST'];
                                        const classIndex = muraClasses.indexOf(prediction.predicted_class);
                                        return classIndex >= 0 ? prediction.probabilities[classIndex] : prediction.probabilities[0];
                                      } else {
                                        const chestClasses = ['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity'];
                                        const classIndex = chestClasses.indexOf(prediction.predicted_class);
                                        return classIndex >= 0 ? prediction.probabilities[classIndex] : prediction.probabilities[0];
                                      }
                                    })()
                                  )}`}
                                >
                                  {(
                                    (() => {
                                      const predType = prediction.reportType || reportType;
                                      if (predType === 'fracture') {
                                        const muraClasses = ['XR_ELBOW', 'XR_FINGER', 'XR_FOREARM', 'XR_HAND', 'XR_HUMERUS', 'XR_SHOULDER', 'XR_WRIST'];
                                        const classIndex = muraClasses.indexOf(prediction.predicted_class);
                                        return classIndex >= 0 ? prediction.probabilities[classIndex] : prediction.probabilities[0];
                                      } else {
                                        const chestClasses = ['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity'];
                                        const classIndex = chestClasses.indexOf(prediction.predicted_class);
                                        return classIndex >= 0 ? prediction.probabilities[classIndex] : prediction.probabilities[0];
                                      }
                                    })() * 100
                                  ).toFixed(2)}
                                  %
                                </span>
                              </p>
                              <div className="text-sm">
                                <p className="font-semibold mb-2">Summary of Findings:</p>
                                {prediction.reportType === 'fracture' ? (
                                  <>
                                    <p>
                                      The model has detected a potential fracture in the{" "}
                                      <span className="font-semibold">{prediction.fractureLocation || prediction.predicted_class}</span> region
                                      with a high degree of confidence. This suggests that the X-ray may show signs
                                      consistent with a fracture in this location.
                                    </p>
                                    <br />
                                    <p>
                                      For a definitive diagnosis and treatment plan, please consult a qualified
                                      orthopedic specialist or radiologist.
                                    </p>
                                  </>
                                ) : (
                                  <>
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
                                  </>
                                )}
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
                        className={`w-full py-3 border-2 rounded-lg text-base font-medium transition flex items-center justify-center gap-2 ${
                          isDarkMode
                            ? 'border-gray-600 text-gray-200 hover:bg-gray-900'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
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
    <>
      <div className={`h-screen flex ${isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900'}`}>
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
        <div className={`px-6 py-4 flex items-center justify-between border-b-2 ${dividerClass} ${panelBackgroundClass}`}>
          <h2 className="text-2xl font-bold">
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
        <div className={`flex-1 overflow-auto ${pageBackgroundClass}`}>
          {renderPage()}
        </div>
      </div>
    </div>

      {selectedReport && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onClick={closeReportModal}
      >
        <div
          className={`w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden ${panelBackgroundClass}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: isDarkMode ? '#1f2937' : '#e5e7eb' }}>
            <div>
              <p className="text-sm uppercase tracking-wide text-blue-400 font-semibold">
                {selectedReport.reportType === 'fracture' ? 'Fracture Report' : 'Chest X-ray Report'}
              </p>
              <h3 className="text-2xl font-bold mt-1">{selectedReport.predictedClass || selectedReport.fractureLocation || 'Report Details'}</h3>
            </div>
            <button
              onClick={closeReportModal}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 transition"
            >
              Close
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className={`rounded-xl p-4 border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <h4 className="text-sm font-semibold uppercase tracking-wide mb-3 text-blue-400">Overview</h4>
                <dl className="space-y-2 text-sm">
                  {userRole === 'doctor' && (
                    <div className="flex justify-between">
                      <dt className={mutedTextClass}>Patient ID</dt>
                      <dd>{selectedReport.userId || 'N/A'}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className={mutedTextClass}>Date</dt>
                    <dd>{selectedReport.createdAt ? new Date(selectedReport.createdAt).toLocaleString() : 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className={mutedTextClass}>Report Type</dt>
                    <dd>{selectedReport.reportType === 'fracture' ? 'Fracture' : 'Chest X-ray'}</dd>
                  </div>
                  {selectedReport.fractureLocation && (
                    <div className="flex justify-between">
                      <dt className={mutedTextClass}>Location</dt>
                      <dd>{selectedReport.fractureLocation.replace('XR_', '').replace('_', ' ')}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className={mutedTextClass}>Confidence</dt>
                    <dd className={`${getConfidenceColor(selectedReport.confidenceScore)} font-semibold`}>
                      {getConfidencePercent(selectedReport)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className={`rounded-xl p-4 border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <h4 className="text-sm font-semibold uppercase tracking-wide mb-3 text-blue-400">Model Notes</h4>
                <p className="text-sm leading-relaxed">
                  {selectedReport.reportType === 'fracture'
                    ? `The model detected potential findings near the ${selectedReport.fractureLocation || selectedReport.predictedClass}. Please correlate with clinical context before final diagnosis.`
                    : `Predicted class: ${selectedReport.predictedClass || 'Unknown'}. Review radiographic features and correlate clinically before finalizing.`}
                </p>
                <p className={`text-xs mt-4 ${mutedTextClass}`}>
                  Saved via MEDBOT · Confidence {getConfidencePercent(selectedReport)}
                </p>
              </div>
            </div>
            {selectedReport.imageURL && (
              <div className={`rounded-xl overflow-hidden border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="px-4 py-3 border-b" style={{ borderColor: isDarkMode ? '#1f2937' : '#e5e7eb' }}>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-blue-400">Uploaded Image</h4>
                </div>
                <div className="bg-black flex justify-center">
                  <img src={selectedReport.imageURL} alt="Report X-ray" className="max-h-[400px] object-contain" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </>
  );
}