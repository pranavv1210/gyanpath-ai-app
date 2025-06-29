import { useState, useEffect } from 'react';
import './App.css'; 

function App() {
  const [backendMessage, setBackendMessage] = useState("Loading backend message...");
  const [aiMessage, setAiMessage] = useState("Loading AI message...");
  const [resources, setResources] = useState([]);
  const [error, setError] = useState(null);

  const [targetConcept, setTargetConcept] = useState("");
  const [learningPath, setLearningPath] = useState(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathMessage, setPathMessage] = useState("");

  const [knowledgeConcept, setKnowledgeConcept] = useState("");
  const [knowledgeLevel, setKnowledgeLevel] = useState(0);
  const [knowledgeUpdateMessage, setKnowledgeUpdateMessage] = useState("");
  const [knowledgeUpdateLoading, setKnowledgeUpdateLoading] = useState(false);

  // <<< NEW STATE FOR AUTHENTICATION
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // Stores {id, email}
  const [accessToken, setAccessToken] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  // >>> END NEW STATE

  useEffect(() => {
    // Check for existing token in localStorage on component mount
    const storedToken = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('currentUser');
    if (storedToken && storedUser) {
      setAccessToken(storedToken);
      setCurrentUser(JSON.parse(storedUser));
      setIsLoggedIn(true);
    }

    // Initial backend checks (always run)
    fetch('http://localhost:5000/')
      .then(response => response.json())
      .then(data => setBackendMessage(data.message))
      .catch(err => setError("Failed to reach backend root."));

    fetch('http://localhost:5000/test-ai')
      .then(response => response.json())
      .then(data => setAiMessage(data.message))
      .catch(err => setError("Failed to reach AI test endpoint."));

    // Fetch all resources (public endpoint, doesn't need auth)
    fetch('http://localhost:5000/resources')
      .then(response => response.json())
      .then(data => setResources(data))
      .catch(err => setError("Failed to fetch all resources."));

  }, []);

  // Helper to get auth headers
  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    };
  };

  // <<< NEW LOGIN FUNCTION
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
    setLearningPath(null); // Clear path on logout
    setKnowledgeUpdateMessage(""); // Clear knowledge message
  };
  // >>> END NEW LOGIN/LOGOUT

  // Function to fetch learning path (MODIFIED TO USE AUTH)
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
      headers: getAuthHeaders() // <<< SEND AUTH HEADER
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

  // Function to update user knowledge (MODIFIED TO USE AUTH)
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
      headers: getAuthHeaders(), // <<< SEND AUTH HEADER
      body: JSON.stringify({ concept_name: knowledgeConcept, level: knowledgeLevel }),
    })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { throw new Error(err.error || 'Failed to update knowledge'); });
        }
        return response.json();
      })
      .then(data => {
        setKnowledgeUpdateMessage(data.message);
        console.log("Knowledge Update Result:", data);
        // Optionally, refetch path after knowledge update if it should auto-refresh
      })
      .catch(error => {
        console.error("Error updating knowledge:", error);
        setKnowledgeUpdateMessage(`Error: ${error.message}`);
      })
      .finally(() => {
        setKnowledgeUpdateLoading(false);
      });
  };

  return (
    <div className="App">
      <header className="App-header" style={{ marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #eee' }}>
        <h1>SkillBridge: Personalized Learning Navigator</h1>
        {isLoggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '15px' }}>
            <p>Welcome, {currentUser.email}!</p>
            <button onClick={handleLogout} style={{ padding: '8px 15px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              Logout
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px', margin: '0 auto' }}>
            <p>Please Login:</p>
            <input
              type="email"
              placeholder="Email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <button onClick={handleLogin} disabled={loginLoading} style={{ padding: '8px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: loginLoading ? 0.7 : 1 }}>
              {loginLoading ? 'Logging In...' : 'Login'}
            </button>
            {loginMessage && <p style={{ color: loginMessage.includes('failed') ? 'red' : 'green', fontSize: '0.9em' }}>{loginMessage}</p>}
            <p style={{fontSize: '0.9em'}}>No account? Create one via Postman (`/create_user`).</p>
          </div>
        )}
      </header>

      {error && <p style={{ color: 'red' }}>App Error: {error}</p>}
      
      <p>Backend Status: {backendMessage}</p>
      <p>AI Service Status: {aiMessage}</p>
      <hr/> 

      {isLoggedIn && ( // Only show these sections if logged in
        <>
          <section style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', marginBottom: '30px', backgroundColor: '#e8f5e9' }}>
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
                style={{ width: 'calc(100% - 22px)', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '1em' }}
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
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '1em' }}
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
                padding: '10px 20px', 
                fontSize: '1em', 
                backgroundColor: '#28a745', 
                color: 'white', 
                border: 'none', 
                borderRadius: '5px', 
                cursor: 'pointer',
                opacity: knowledgeUpdateLoading ? 0.7 : 1
              }}
            >
              {knowledgeUpdateLoading ? 'Updating...' : 'Update Knowledge'}
            </button>
            {knowledgeUpdateMessage && <p style={{ marginTop: '10px', color: knowledgeUpdateMessage.startsWith('Error') ? 'red' : 'green' }}>{knowledgeUpdateMessage}</p>}
          </section>

          <section style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
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
                style={{ width: 'calc(100% - 22px)', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '1em' }}
              />
            </div>
            <button 
              onClick={fetchLearningPath} 
              disabled={pathLoading}
              style={{ 
                padding: '10px 20px', 
                fontSize: '1em', 
                backgroundColor: '#007bff', 
                color: 'white', 
                border: 'none', 
                borderRadius: '5px', 
                cursor: 'pointer',
                opacity: pathLoading ? 0.7 : 1
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
                    <div key={index} style={{ marginBottom: '20px', padding: '15px', background: '#f9f9f9', borderRadius: '6px', borderLeft: '5px solid #007bff' }}>
                      <h4>Step {index + 1}: Learn "{step.concept}"</h4>
                      {step.resources && step.resources.length > 0 ? (
                        <ul>
                          {step.resources.map(res => (
                            <li key={res.id} style={{ marginBottom: '5px' }}>
                              <a href={res.url} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', textDecoration: 'none' }}>
                                {res.title}
                              </a> ({res.resource_type || 'N/A'})
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
      )} {/* End isLoggedIn conditional rendering */}

      <hr/>

      <h2>Available Learning Resources (All)</h2>
      {resources.length === 0 ? (
        <p>No resources found. Add some using Postman or a future admin interface!</p>
      ) : (
        <div className="resources-list">
          {resources.map(resource => (
            <div key={resource.id} className="resource-card" style={{ marginBottom: '15px', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
              <h3>{resource.title}</h3>
              <p><strong>Type:</strong> {resource.resource_type} | <strong>Source:</strong> {resource.source || 'N/A'}</p>
              <p><strong>Difficulty:</strong> {resource.difficulty || 'N/A'} | <strong>Est. Time:</strong> {resource.estimated_time_minutes ? `${resource.estimated_time_minutes} mins` : 'N/A'}</p>
              <p>{resource.description}</p>
              <a href={resource.url} target="_blank" rel="noopener noreferrer">Learn More</a>
            </div>
          ))}
        </div>
      )}

      {/* You can remove or modify the default Vite/React elements below if desired */}
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