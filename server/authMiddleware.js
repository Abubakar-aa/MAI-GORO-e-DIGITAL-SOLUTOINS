// ============================================================
// MAI GORO — Authentication Middleware (JWT Protection)
// ============================================================
// This middleware sits in front of protected routes.
// It checks whether the client provided a valid JSON Web Token (JWT).

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    // 1. Check if Authorization header is present
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Access denied. Please log in first.'
        });
    }

    // 2. Extract token (removes 'Bearer ' prefix)
    const token = authHeader.split(' ')[1];

    try {
        // 3. Verify the token using secret key from .env
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 4. Attach decoded user payload to request object
        req.user = decoded;

        // 5. Proceed to the protected route
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired session. Please log in again.'
        });
    }
}

module.exports = requireAuth;
