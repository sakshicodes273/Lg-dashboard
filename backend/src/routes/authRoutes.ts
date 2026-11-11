import { Router } from 'express'
import { currentUser, login, logout, register } from '../controllers/authController.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const authRoutes = Router()

authRoutes.post('/register', register)
authRoutes.post('/login', login)
authRoutes.post('/logout', logout)
authRoutes.get('/me', requireAuth, currentUser)

export default authRoutes