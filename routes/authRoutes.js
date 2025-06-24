const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, pool, poolConnect } = require('../config/db');

const router = express.Router();

router.post('/register', async (req, res)=>{
    const{ email, password , role}= req.body;
    try{
        await poolConnect;
        const hashedPassword = await bcrypt.hash(password, 10);
        const request=pool.request();
        request.input('Email', sql.NVarChar, email);
        request.input('Password', sql.NVarChar, hashedPassword);
        request.input('Role', sql.NVarChar,role || 'user');
        await request.query('Insert into Users(Email,Password,Role) values(@Email,@Password,@Role)');
        res.status(201).json({ message: 'User registered successfully' });
    }
    catch(err)
    {
        res.status(500).json({ error: 'Registration Failed' });
        console.error(err);
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        await poolConnect;
        const request = pool.request();
        request.input('Email', sql.NVarChar, email);
        const result = await request.query('SELECT * FROM Users WHERE Email = @Email');
        
        const user=result.recordset[0];
        if (!user) {
            return res.status(400).json({ error: 'Invalid Credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.Password);
        
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        
        const token = jwt.sign({ userId: user.UserId, role: user.Role,email:user.Email}, process.env.JWT_SECRET);
        
        res.json({ token, userId: user.UserId, role: user.Role });
    } catch (err) {
        res.status(500).json({ message: 'Login Failed', error: err.message });
    }
});

module.exports = router;