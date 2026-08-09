import { Box, Typography, Button, TextField, Paper, Alert, CircularProgress } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await api.post('/token/', { username, password });
      const { access, refresh } = response.data;
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
      
      // Fetch user role
      let role = 'seller';
      try {
        const meResponse = await api.get('/users/users/me/');
        const data = meResponse.data;
        role = data.role;
        if (!role && (data.is_superuser || data.is_staff)) {
          role = 'manager';
        }
        role = role || 'seller';
        localStorage.setItem('user_role', role);
      } catch (e) {
        console.error("Failed to fetch user role", e);
        role = 'user';
        localStorage.setItem('user_role', role);
      }

      navigate(role === 'manager' ? '/' : '/orders');
    } catch (err) {
      setError('Неверное имя пользователя или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
      <Paper sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3, width: 400, alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Дом Вкуса</Typography>
        <Typography variant="body1" color="text.secondary">Войдите в систему</Typography>
        
        {error && (
          <Alert severity="error" role="alert" aria-live="assertive" sx={{ width: '100%' }}>
            {error}
          </Alert>
        )}
        
        <TextField 
          id="login-username"
          fullWidth 
          label="Email (Username)" 
          variant="outlined" 
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <TextField 
          id="login-password"
          fullWidth 
          label="Пароль" 
          type="password" 
          variant="outlined" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          autoComplete="current-password"
        />
        <Button 
          fullWidth 
          variant="contained" 
          size="large" 
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Войти'}
        </Button>
      </Paper>
    </Box>
  );
};

export default Login;
