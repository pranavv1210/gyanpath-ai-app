import { useState, useEffect, useRef } from 'react';
import './App.css'; 

function App() {
  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // NEW STATE FOR SIGNUP
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupMessage, setSignupMessage] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  // Main App Content State
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');

  // Learning Path Generation State
  const [targetConcept, setTargetConcept] = useState("");
  const [learningPath, setLearningPath] = useState(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathMessage, setPathLoadingMessage] = useState("");

  // Knowledge Assessment State
  const [knowledgeConcept, setKnowledgeConcept] = useState("");
  const [knowledgeLevel, setKnowledgeLevel] = useState(""); // Default to empty string for placeholder
  const [knowledgeUpdateMessage, setKnowledgeUpdateMessage] = useState("");
  const [knowledgeUpdateLoading, setKnowledgeUpdateLoading] = useState(false);

  // All Resources List State (for 'All Resources' page)
  const [allResources, setAllResources] = useState([]);
  const [allResourcesLoading, setAllResourcesLoading] = useState(false);
  const [allResourcesError, setAllResourcesError] = useState(null);

  // Contribute Resource State
  const [contributeUrl, setContributeUrl] = useState("");
  const [contributeMessage, setContributeMessage] = useState("");
  const [contributeLoading, setContributeLoading] = useState(false);

  // Profile Dropdown State and Ref
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef();

  // Profile Settings State
  const [currentEmailDisplay, setCurrentEmailDisplay] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // App Settings (Dark Mode) State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    return savedMode ? JSON.parse(savedMode) : false;
  });

  useEffect(() => {
    // Check for existing token in localStorage on component mount
    const storedToken = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('currentUser');
    if (storedToken && storedUser) {
      setAccessToken(storedToken);
      setCurrentUser(JSON.parse(storedUser));
      setIsLoggedIn(true);
    }
  }, []);

  // Effect to fetch All Resources when the 'allResources' page is active
  useEffect(() => {
    if (currentPage === 'allResources' && isLoggedIn) {
      setAllResourcesLoading(true);
      setAllResourcesError(null);
      fetch('http://localhost:5000/resources')
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => setAllResources(data))
        .catch(err => {
          console.error("Error fetching all resources:", err);
          setAllResourcesError("Failed to load resources.");
        })
        .finally(() => {
          setAllResourcesLoading(false);
        });
    }
  }, [currentPage, isLoggedIn]);

  // Effect to apply dark mode class to HTML element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // Effect to fetch user profile data when profileSettings page is active
  useEffect(() => {
    if (currentPage === 'profileSettings' && isLoggedIn && currentUser?.id && accessToken) {
      setProfileLoading(true);
      setProfileMessage('');
      fetch(`http://localhost:5000/users/${currentUser.id}/profile`, {
        headers: getAuthHeaders()
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { throw new Error(err.error || 'Failed to fetch profile'); });
        }
        return response.json();
      })
      .then(data => {
        setCurrentEmailDisplay(data.email);
      })
      .catch(error => {
        console.error("Error fetching profile data:", error);
        setProfileMessage(`Error loading profile: ${error.message}`);
      })
      .finally(() => {
        setProfileLoading(false);
      });
    }
  }, [currentPage, isLoggedIn, currentUser?.id, accessToken]);


  // Click outside to close profile menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    };
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileMenuOpen]);


  // Helper to get auth headers
  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    };
  };

  // Login Function
  const handleLogin = () => {
    if (!loginEmail || !loginPassword) {
      setLoginMessage("Please enter email and password.");
      return;
    }
    setLoginLoading(true);
    setLoginMessage("");
    setError(null);

    fetch('http://localhost:5000/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { throw new Error(err.error || 'Login failed'); });
        }
        return response.json();
      })
      .then(data => {
        setAccessToken(data.access_token);
        setCurrentUser({ id: data.user_id, email: data.email });
        setIsLoggedIn(true);
        localStorage.setItem('accessToken', data.access_token);
        localStorage.setItem('currentUser', JSON.stringify({ id: data.user_id, email: data.email }));
        setLoginMessage("Login successful!");
        setLoginEmail("");
        setLoginPassword("");
        setCurrentPage('dashboard');
        setIsSigningUp(false);
      })
      .catch(error => {
        console.error("Login Error:", error);
        setLoginMessage(`Login failed: ${error.message}`);
        setIsLoggedIn(false);
        setCurrentUser(null);
        setAccessToken(null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('currentUser');
      })
      .finally(() => {
        setLoginLoading(false);
      });
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setAccessToken(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('currentUser');
    setLoginMessage("Logged out.");
    setLearningPath(null);
    setKnowledgeUpdateMessage("");
    setTargetConcept("");
    setKnowledgeConcept("");
    setKnowledgeLevel("");
    setSidebarOpen(false);
    setProfileMenuOpen(false);
    setCurrentPage('dashboard');
  };

  // Function to fetch learning path
  const fetchLearningPath = () => {
    if (!accessToken || !currentUser) {
      alert("Please log in to generate a path.");
      return;
    }
    if (!targetConcept) {
      alert("Please enter a target concept!");
      return;
    }
    setPathLoading(true);
    setLearningPath(null);
    setPathMessage("");
    setError(null);

    const encodedTargetConcept = encodeURIComponent(targetConcept);
    fetch(`http://localhost:5000/users/${currentUser.id}/learning_path?target_concept=${encodedTargetConcept}`, {
      headers: getAuthHeaders()
    })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { throw new Error(err.error || 'Failed to generate path'); });
        }
        return response.json();
      })
      .then(data => {
        setLearningPath(data);
        setPathMessage(data.message);
        console.log("Generated Path:", data);
      })
      .catch(error => {
        console.error("Error fetching learning path:", error);
        setError(`Path generation failed: ${error.message}`);
      })
      .finally(() => {
        setPathLoading(false);
      });
  };

  // Function to update user knowledge
  const updateKnowledge = () => {
    if (!accessToken || !currentUser) {
      alert("Please log in to update knowledge.");
      return;
    }
    if (!knowledgeConcept || knowledgeLevel === "" || isNaN(knowledgeLevel)) {
      alert("Please enter a concept and select a valid level!");
      return;
    }
    setKnowledgeUpdateLoading(true);
    setKnowledgeUpdateMessage("");
    setError(null);

    fetch(`http://localhost:5000/users/${currentUser.id}/knowledge`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ concept_name: knowledgeConcept, level: parseInt(knowledgeLevel) }),
    })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { throw new Error(err.error || 'Unknown error'); });
        }
        return response.json();
      })
      .then(data => {
        setKnowledgeUpdateMessage(data.message);
        console.log("Knowledge Update Result:", data);
      })
      .catch(error => {
        console.error("Error updating knowledge:", error);
        setKnowledgeUpdateMessage(`Error: ${error.message || "Failed to update knowledge."}`);
      })
      .finally(() => {
        setKnowledgeUpdateLoading(false);
      });
  };

  // Function to handle resource contribution
  const handleContributeResource = () => {
    if (!accessToken || !currentUser) {
      setContributeMessage("Please log in to contribute resources.");
      return;
    }
    if (!contributeUrl) {
      setContributeMessage("Please enter a URL to contribute.");
      return;
    }

    setContributeLoading(true);
    setContributeMessage("");
    setError(null);

    fetch('http://localhost:5000/fetch_and_add_resource', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ url: contributeUrl }),
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || 'Failed to add resource'); });
      }
      return response.json();
    })
    .then(data => {
      setContributeMessage(data.message);
      setContributeUrl("");
      console.log("Contribute Result:", data);
      if (currentPage === 'allResources') { 
        setAllResourcesLoading(true);
        fetch('http://localhost:5000/resources')
          .then(res => res.json())
          .then(data => setAllResources(data))
          .catch(err => setAllResourcesError("Failed to refresh resources after contribution."))
          .finally(() => setAllResourcesLoading(false));
      }
    })
    .catch(error => {
      console.error("Contribute Error:", error);
      setContributeMessage(`Error: ${error.message}`);
    })
    .finally(() => {
      setContributeLoading(false);
    });
  };

  // Sidebar Toggle Functions
  const openSidebar = () => {
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  // Toggle Profile Menu
  const toggleProfileMenu = () => {
    setProfileMenuOpen(prev => !prev);
  };

  // Dark Mode Toggle Function
  const toggleDarkMode = () => {
    setIsDarkMode(prevMode => !prevMode);
  };

  // Handle Signup Function
  const handleSignUp = () => {
    if (!signupEmail || !signupPassword || !signupConfirmPassword) {
      setSignupMessage("All fields are required.");
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setSignupMessage("Passwords do not match.");
      return;
    }
    setSignupLoading(true);
    setSignupMessage("");
    setError(null);

    fetch('http://localhost:5000/create_user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: signupEmail, password: signupPassword }),
    })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { throw new Error(err.error || 'Signup failed'); });
        }
        return response.json();
      })
      .then(data => {
        setSignupMessage(`Signup successful! You can now login. User ID: ${data.user_id}`);
        setSignupEmail("");
        setSignupPassword("");
        setSignupConfirmPassword("");
        setIsSigningUp(false);
      })
      .catch(error => {
        console.error("Signup Error:", error);
        setSignupMessage(`Signup failed: ${error.message}`);
      })
      .finally(() => {
        setSignupLoading(false);
      });
  };

  // Content Renderers for different pages
  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <>
            <section className="content-card">
              <h2>Assess Your Knowledge</h2>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="knowledgeConceptInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Concept:
                </label>
                <input
                  id="knowledgeConceptInput"
                  type="text"
                  value={knowledgeConcept}
                  onChange={(e) => setKnowledgeConcept(e.target.value)}
                  placeholder="e.g., Python Basics"
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="knowledgeLevelSelect" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Select Level
                </label>
                <select
                  id="knowledgeLevelSelect"
                  value={knowledgeLevel}
                  onChange={(e) => setKnowledgeLevel(e.target.value)}
                >
                  <option value="">-- Select Level --</option>
                  <option value="1">1(Novice)</option>
                  <option value="2">2(Familiar)</option>
                  <option value="3">3 (Competent)</option>
                  <option value="4">4 (Proficient)</option>
                  <option value="5">5 (Expert)</option>
                </select>
              </div>
              <button 
                onClick={updateKnowledge} 
                disabled={knowledgeUpdateLoading}
              >
                {knowledgeUpdateLoading ? 'UPDATING...' : 'UPDATE KNOWLEDGE'}
              </button>
              {knowledgeUpdateMessage && <p style={{ marginTop: '10px', color: knowledgeUpdateMessage.startsWith('Error') ? 'var(--sb-accent-red)' : 'var(--sb-primary-color)' }}>{knowledgeUpdateMessage}</p>}
            </section>

            <section className="content-card">
              <h2>Generate Personalized Learning Path</h2>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="targetConceptInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  What do you want to learn today?
                </label>
                <input
                  id="targetConceptInput"
                  type="text"
                  value={targetConcept}
                  onChange={(e) => setTargetConcept(e.target.value)}
                  placeholder="e.g., Machine Learning Fundamentals"
                />
              </div>
              <button 
                onClick={fetchLearningPath} 
                disabled={pathLoading}
              >
                {pathLoading ? 'GENERATING...' : 'GENERATE PATH'}
              </button>

              {pathLoading && <p>Generating your personalized path...</p>}
              {learningPath && (
                <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                  <h3>Path for "{learningPath.target_concept}"</h3>
                  {learningPath.path && learningPath.path.length > 0 ? (
                    learningPath.path.map((step, index) => (
                      <div key={index} className="path-step-card">
                        <h4>Step {index + 1}: Learn "{step.concept}"</h4>
                        {step.resources && step.resources.length > 0 ? (
                          <ul>
                            {step.resources.map(res => (
                              <li key={res.id}>
                                <a href={res.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sb-accent-blue)', textDecoration: 'none' }}>
                                  {res.title}
                                </a> ({res.resource_type || 'N/A'})
                                <p style={{fontSize: '0.9em', color: '#666'}}>{res.description}</p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No resources found for this concept in the path (yet).</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p>{pathMessage || "No specific steps recommended at this time based on your knowledge."}</p>
                  )}
                </div>
              )}
            </section>
          </>
        );
      case 'allResources':
        return (
          <section className="content-card">
            <h2>Search Uploaded Resources</h2>
            {allResourcesLoading && <p>Loading resources...</p>}
            {allResourcesError && <p style={{color: 'var(--sb-accent-red)'}}>{allResourcesError}</p>}
            {!allResourcesLoading && allResources.length === 0 && !allResourcesError ? (
              <p>No resources found. Try contributing one!</p>
            ) : (
              <div className="resources-list">
                {allResources.map(resource => (
                  <div key={resource.id} className="resource-card">
                    <h3>{resource.title}</h3>
                    <p><strong>Type:</strong> {resource.resource_type} | <strong>Source:</strong> {resource.source || 'N/A'}</p>
                    <p><strong>Difficulty:</strong> {resource.difficulty || 'N/A'} | <strong>Est. Time:</strong> {resource.estimated_time_minutes ? `${resource.estimated_time_minutes} mins` : 'N/A'}</p>
                    <p>{resource.description}</p>
                    <a href={resource.url} target="_blank" rel="noopener noreferrer">Learn More</a>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      case 'contribute':
        return (
          <section className="content-card">
            <h2>Contribute a New Resource</h2>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="contributeUrlInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Resource URL:
              </label>
              <input
                id="contributeUrlInput"
                type="text"
                value={contributeUrl}
                onChange={(e) => setContributeUrl(e.target.value)}
                placeholder="https://example.com/great-article"
              />
            </div>
            <button
              onClick={handleContributeResource}
              disabled={contributeLoading}
            >
              {contributeLoading ? 'ADDING...' : 'ADD RESOURCE'}
            </button>
            {contributeMessage && <p style={{ marginTop: '10px', color: contributeMessage.startsWith('Error') ? 'var(--sb-accent-red)' : 'var(--sb-primary-color)' }}>{contributeMessage}</p>}
          </section>
        );
      case 'profileSettings':
        return (
          <section className="content-card">
            <h2>Profile Settings</h2>
            {profileLoading && <p>Loading profile...</p>}
            {profileMessage && <p style={{ color: profileMessage.startsWith('Error') ? 'var(--sb-accent-red)' : 'var(--sb-primary-color)' }}>{profileMessage}</p>}
            
            {currentUser && !profileLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Account Information */}
                <div>
                  <h3>Account Information</h3>
                  <p><strong>Email:</strong> {currentEmailDisplay}</p>
                  
                  <h4>Change Password</h4>
                  <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="oldPasswordInput" style={{ display: 'block', marginBottom: '5px' }}>Old Password:</label>
                    <input
                      id="oldPasswordInput"
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Enter old password"
                    />
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="newPasswordInput" style={{ display: 'block', marginBottom: '5px' }}>New Password:</label>
                    <input
                      id="newPasswordInput"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="confirmNewPasswordInput" style={{ display: 'block', marginBottom: '5px' }}>Confirm New Password:</label>
                    <input
                      id="confirmNewPasswordInput"
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                  <button onClick={() => alert("Password change functionality coming soon!")}>Change Password</button>
                </div>

                <hr/>
              </div>
            )}
          </section>
        );
      case 'appSettings':
        return (
          <section className="content-card">
            <h2>App Settings</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Dark Mode Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2em', color: 'var(--sb-text-dark)' }}>Dark Mode</h3>
                    <label className="switch">
                        <input 
                            type="checkbox" 
                            checked={isDarkMode} 
                            onChange={toggleDarkMode} 
                        />
                        <span className="slider round"></span>
                    </label>
                </div>

                {/* Other settings can go here */}
                <p style={{color: '#666'}}>More app settings coming soon!</p>
            </div>
          </section>
        );
      default:
        return <section className="content-card"><h2>Page Not Found</h2></section>;
    }
  };


  // --- Conditional Rendering of Login Page vs. Main App ---
  if (!isLoggedIn) {
    return (
      <div className="App login-page">
        {/* Left Green Panel */}
        <div className="login-panel-left">
            <img src="/favicon.png" alt="GyanPath.ai Logo" />
            <h1>GYANPATH.AI</h1>
            <p>Personalized Learning Navigator</p>
        </div>

        {/* Right Login/Sign Up Panel */}
        <div className="login-panel-right">
            <div className="login-form-container">
                <h2>Login / Sign Up</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
                    <input
                        type="email"
                        placeholder="Username (Email)"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    <button
                        onClick={handleLogin}
                        disabled={loginLoading}
                        style={{padding: '18px 25px'}}
                    >
                        {loginLoading ? 'LOGGING IN...' : 'LOGIN'}
                    </button>
                    {loginMessage && <p style={{ color: loginMessage.includes('failed') ? 'var(--sb-accent-red)' : 'var(--sb-primary-color)', fontSize: '0.9em', textAlign: 'center' }}>{loginMessage}</p>}
                    
                    <p style={{ fontSize: '1em', textAlign: 'center', marginTop: '10px' }}>
                        Create new account, <a href="#" onClick={() => setIsSigningUp(true)} style={{ color: 'var(--sb-accent-blue)', textDecoration: 'none', fontWeight: 'bold' }}>Sign Up</a>
                    </p>

                    {/* Social Login Buttons (Placeholders for now) */}
                    <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }}/>
                    <div className="social-login" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <button style={{ backgroundColor: '#db4437', padding: '12px', fontSize: '1.1em', borderRadius: '8px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                            <img src="https://img.icons8.com/color/24/000000/google-logo.png" alt="Google icon" style={{ height: '20px' }}/> LOGIN WITH GOOGLE
                        </button>
                        <button style={{ backgroundColor: '#333', padding: '12px', fontSize: '1.1em', borderRadius: '8px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                            <img src="https://img.icons8.com/ios-filled/24/ffffff/github.png" alt="GitHub icon" style={{ height: '20px' }}/> LOGIN WITH GITHUB
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    );
  }

  // --- Main Application Content (if isLoggedIn) ---
  return (
    <div className={`App ${sidebarOpen ? 'side-nav-open' : ''}`}>
      {/* Top Navigation Bar */}
      <header className="app-main-header">
        <div className="header-left">
          <span className="hamburger-icon" onClick={openSidebar}>&#9776;</span> {/* Hamburger Menu Icon */}
        </div>
        <div className="header-center">
            <h1>GYANPATH.AI: Personalized Learning Navigator</h1>
        </div>
        <div className="header-right">
          <div className="profile-info" ref={profileRef}>
            <p>Welcome, {currentUser?.email.split('@')[0] || 'User'}</p>
            <span className="profile-icon" onClick={toggleProfileMenu}>&#128100;</span>
            
            {profileMenuOpen && ( // Render dropdown if open
              <div className="profile-dropdown">
                <a href="#" onClick={() => { setCurrentPage('profileSettings'); setProfileMenuOpen(false); }}>Profile Settings</a>
                <a href="#" onClick={() => { setCurrentPage('appSettings'); setProfileMenuOpen(false); }}>Settings</a>
                <hr/>
                <a href="#" onClick={() => { handleLogout(); setProfileMenuOpen(false); }}>Logout</a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Side Navigation Menu */}
      <div id="mySidenav" className={`side-nav ${sidebarOpen ? 'open' : ''}`}>
        <a href="#" className="closebtn" onClick={closeSidebar}>&times;</a>
        <a href="#" onClick={() => { setCurrentPage('dashboard'); closeSidebar(); }}>Dashboard</a>
        <a href="#" onClick={() => { setCurrentPage('allResources'); closeSidebar(); }}>Search Uploaded Resources</a>
        <a href="#" onClick={() => { setCurrentPage('contribute'); closeSidebar(); }}>Contribute Resource</a>
        <a href="#" onClick={() => { alert("My Progress coming soon!"); closeSidebar(); }}>My Progress</a>
        <a href="#" onClick={() => { alert("Explore Concepts coming soon!"); closeSidebar(); }}>Explore Concepts</a>
      </div>

      {/* Overlay to close sidebar on click outside */}
      {sidebarOpen && <div className="overlay active" onClick={closeSidebar}></div>}


      {/* Main Content Area */}
      <main className="main-app-content">
        {error && <p style={{ color: 'var(--sb-accent-red)' }}>App Error: {error}</p>}
        
        {renderContent()}

      </main>
    </div>
  );
}

export default App;