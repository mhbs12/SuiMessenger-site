import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { MessengerPage } from './pages/MessengerPage';
import { PACKAGE_ID } from './constants';

function App() {
    console.log('Current PACKAGE_ID:', PACKAGE_ID);
    return (
        <Router>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/chat" element={<MessengerPage />} />
            </Routes>
        </Router>
    );
}

export default App;
