// api/auth.js - Authentication endpoint
const ADMIN_PASSWORD = 'mitchythegoat1';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method === 'POST') {
        const { password } = req.body || {};
        
        if (password === ADMIN_PASSWORD) {
            res.json({ 
                success: true, 
                authenticated: true,
                message: 'Authentication successful'
            });
        } else {
            res.status(401).json({ 
                success: false, 
                authenticated: false,
                error: 'Invalid password' 
            });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
} 
