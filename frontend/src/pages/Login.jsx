import { Box, Typography, Button, TextField, Paper, Alert, CircularProgress } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { beginSession } from '../api';
import { extractApiError, homePath } from '../utils';
import BrandMark from '../components/BrandMark';

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
      beginSession();
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
        localStorage.setItem('user_modules', JSON.stringify(data.modules || []));
        localStorage.setItem('user_job_title', data.job_title || '');
        const displayName = `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.username || username;
        localStorage.setItem('user_name', displayName);
        localStorage.setItem('user_username', data.username || username);
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_modules');
        localStorage.removeItem('user_job_title');
        localStorage.removeItem('user_username');
        setError('Не удалось загрузить профиль. Попробуйте ещё раз.');
        return;
      }

      navigate(homePath());
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403 || status === 429) {
        setError(extractApiError(err));
      } else {
        setError('Неверное имя пользователя или пароль');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
      <Paper sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3, width: 400, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BrandMark height={64} />
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Дом Вкуса</Typography>
        </Box>
        <Typography variant="body1" sx={{
          color: "text.secondary"
        }}>Войдите в систему</Typography>
        
        {error && (
          <Alert severity="error" role="alert" aria-live="assertive" sx={{ width: '100%' }}>
            {error}
          </Alert>
        )}
        
        <TextField 
          id="login-username"
          fullWidth 
          label="Логин" 
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
