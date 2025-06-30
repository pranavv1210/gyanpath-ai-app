import { useState, useEffect } from 'react';
import './App.css'; // Make sure this is imported

function App() {
  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // Stores {id, email}
  const [accessToken, setAccessToken] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Main App Content State (only loaded if logged in)
  const [backendMessage, setBackendMessage] = useState("Loading backend message...");
  const [aiMessage, setAiMessage] = useState("Loading AI message...");
  const [resources, setResources] = useState([]);
  const [error, setError] = useState(null);

  // Learning Path Generation State
  const [targetConcept, setTargetConcept] = useState("");
  const [learningPath, setLearningPath] = useState(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathMessage, setPathMessage] = useState("");

  // Knowledge Assessment State
  const [knowledgeConcept, setKnowledgeConcept] = useState("");
  const [knowledgeLevel, setKnowledgeLevel] = useState(0);
  const [knowledgeUpdateMessage, setKnowledgeUpdateMessage] = useState("");
  const [knowledgeUpdateLoading, setKnowledgeUpdateLoading] = useState(false);

  useEffect(() => {
    // Check for existing token in localStorage on component mount
    const storedToken = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('currentUser');
    if (storedToken && storedUser) {
      setAccessToken(storedToken);
      setCurrentUser(JSON.parse(storedUser));
      setIsLoggedIn(true);
      fetchAppData(storedToken); // Fetch data if already logged in
    } else {
      setBackendMessage("Please log in to load app data.");
      setAiMessage("Please log in to load app data.");
      setResources([]);
    }

    // Initial public backend checks (always run, even if not logged in)
    fetch('http://localhost:5000/')
      .then(response => response.json())
      .then(data => setBackendMessage(data.message))
      .catch(err => setBackendMessage("Backend (Root) not reachable."));

    fetch('http://localhost:5000/test-ai')
      .then(response => response.json())
      .then(data => setAiMessage(data.message))
      .catch(err => setAiMessage("AI Test Endpoint not reachable."));

    // Public resources fetch - this can remain if you want public Browse of all resources
    fetch('http://localhost:5000/resources')
      .then(response => response.json())
      .then(data => setResources(data))
      .catch(err => console.error("Error fetching all resources:", err));

  }, []);

  // Helper function to fetch main app data (after login) - currently not used for resources, but good pattern
  const fetchAppData = async (token) => {
    // Add more authenticated data fetching here if needed
  };


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
        fetchAppData(data.access_token);
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
    setKnowledgeLevel(0);
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
    if (!knowledgeConcept || knowledgeLevel === 0) {
      alert("Please enter a concept and select a level!");
      return;
    }
    setKnowledgeUpdateLoading(true);
    setKnowledgeUpdateMessage("");
    setError(null);

    fetch(`http://localhost:5000/users/${currentUser.id}/knowledge`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ concept_name: knowledgeConcept, level: knowledgeLevel }),
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

  // --- Conditional Rendering of Login Page vs. Main App ---
  if (!isLoggedIn) {
    return (
      // Added login-page class for global styling from App.css
      <div className="App login-page">
        {/* Left Green Panel (based on your image) */}
        <div className="login-panel-left">
            <img src="/favicon.png" alt="SkillBridge Logo" /> {/* Use favicon.png here */}
            <h1>SKILLBRIDGE</h1>
            <p>Personalized Learning Navigator</p>
        </div>

        {/* Right Login/Sign Up Panel (based on your image) */}
        <div className="login-panel-right">
            <h2>Login / Sign Up</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '80%', maxWidth: '350px' }}>
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
                >
                    {loginLoading ? 'LOGGING IN...' : 'LOGIN'}
                </button>
                {loginMessage && <p style={{ color: loginMessage.includes('failed') ? 'var(--sb-accent-red)' : 'var(--sb-primary-color)', fontSize: '0.9em', textAlign: 'center' }}>{loginMessage}</p>}
                
                <p style={{ fontSize: '1em', textAlign: 'center', marginTop: '15px' }}>
                    Create new account, <a href="#" onClick={() => alert("Sign Up functionality coming soon! Please use Postman to create an account for now.")} style={{ color: 'var(--sb-accent-blue)', textDecoration: 'none', fontWeight: 'bold' }}>Sign Up</a>
                </p>

                {/* Social Login Buttons (Placeholders for now) */}
                <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }}/>
                <div className="social-login" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button style={{ backgroundColor: '#db4437' }}>
                        <img src="https://img.icons8.com/color/24/000000/google-logo.png" alt="Google icon" style={{ height: '20px' }}/> LOGIN WITH GOOGLE
                    </button>
                    <button style={{ backgroundColor: '#333' }}>
                        <img src="https://img.icons8.com/ios-filled/24/ffffff/github.png" alt="GitHub icon" style={{ height: '20px' }}/> LOGIN WITH GITHUB
                    </button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  // --- Main Application Content (if isLoggedIn) ---
  return (
    <div className="App">
      <header className="App-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <img src="/favicon.png" alt="SkillBridge Logo" style={{ height: '50px' }} /> {/* Use favicon.png here */}
          <h1>SkillBridge: Personalized Learning Navigator</h1>
        </div>
        {isLoggedIn && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '15px', position: 'absolute', top: '20px', right: '20px' }}>
            <p style={{ margin: 0, color: 'var(--sb-text-dark)' }}>Welcome, {currentUser.email}!</p>
            <button onClick={handleLogout} style={{ backgroundColor: 'var(--sb-accent-red)', color: 'var(--sb-text-light)' }}>
              Logout
            </button>
          </div>
        )}
      </header>

      {error && <p style={{ color: 'var(--sb-accent-red)' }}>App Error: {error}</p>}
      
      {/* Backend Status Messages - can move or remove later */}
      <p style={{color: 'var(--sb-text-dark)'}}>Backend Status: {backendMessage}</p>
      <p style={{color: 'var(--sb-text-dark)'}}>AI Service Status: {aiMessage}</p>
      <hr/> 

      {/* Assess Your Knowledge Section */}
      <section>
        <h2>Assess Your Knowledge (User ID: {currentUser?.id})</h2>
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
            Level (1=Novice, 5=Expert):
          </label>
          <select
            id="knowledgeLevelSelect"
            value={knowledgeLevel}
            onChange={(e) => setKnowledgeLevel(parseInt(e.target.value))}
          >
            <option value="0">-- Select Level --</option>
            <option value="1">1 (Novice)</option>
            <option value="2">2 (Familiar)</option>
            <option value="3">3 (Competent)</option>
            <option value="4">4 (Proficient)</option>
            <option value="5">5 (Expert)</option>
          </select>
        </div>
        <button 
          onClick={updateKnowledge} 
          disabled={knowledgeUpdateLoading}
          style={{ 
            backgroundColor: 'var(--sb-primary-color)',
            color: 'var(--sb-text-light)'
          }}
        >
          {knowledgeUpdateLoading ? 'Updating...' : 'Update Knowledge'}
        </button>
        {knowledgeUpdateMessage && <p style={{ marginTop: '10px', color: knowledgeUpdateMessage.startsWith('Error') ? 'var(--sb-accent-red)' : 'var(--sb-primary-color)' }}>{knowledgeUpdateMessage}</p>}
      </section>

      {/* Learning Path Generation Section */}
      <section>
        <h2>Generate Personalized Learning Path (User ID: {currentUser?.id})</h2>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="targetConceptInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            What do you want to learn?
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
          style={{ 
            backgroundColor: 'var(--sb-primary-color)',
            color: 'var(--sb-text-light)'
          }}
        >
          {pathLoading ? 'Generating...' : 'Generate Path'}
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

      <hr/>

      <h2>Available Learning Resources (All)</h2>
      {resources.length === 0 ? (
        <p>No resources found. Add some using Postman or a future admin interface!</p>
      ) : (
        <div className="resources-list">
          {resources.map(resource => (
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

      {/* Default Vite/React elements (can be removed) */}
      <div className="card">
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  );
}

export default App;