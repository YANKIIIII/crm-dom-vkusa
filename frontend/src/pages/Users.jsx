import { Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';
import { extractApiError } from '../utils';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    username: '',
    password: '',
    role: 'seller'
  });

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users/users/');
      setUsers(response.data.results || response.data);
    } catch (error) {
      console.error("Failed to fetch users", error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateUser = async () => {
    setLoading(true);
    try {
      await api.post('/users/users/', formData);
      setOpenModal(false);
      fetchUsers(); // refresh the list
    } catch (error) {
      console.error("Failed to create user", error);
      alert(`Не удалось создать пользователя:\n${extractApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">Пользователи</Typography>
        <Button variant="contained" color="primary" onClick={() => setOpenModal(true)}>
          НОВЫЙ ПОЛЬЗОВАТЕЛЬ +
        </Button>
      </Box>
      
      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Имя</TableCell>
                <TableCell>Фамилия</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Роль</TableCell>
                <TableCell>Дата создания</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ color: '#1A202C' }}>{row.first_name || '—'}</TableCell>
                  <TableCell sx={{ color: '#1A202C' }}>{row.last_name || '—'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.email || '—'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.role}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>
                    {row.created_at ? new Date(row.created_at).toLocaleDateString('ru-RU') : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: '#718096' }}>Нет пользователей</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создание пользователя</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField fullWidth label="Имя" name="first_name" value={formData.first_name} onChange={handleInputChange} />
            <TextField fullWidth label="Фамилия" name="last_name" value={formData.last_name} onChange={handleInputChange} />
          </Box>
          <TextField fullWidth label="Email" name="email" value={formData.email} onChange={handleInputChange} />
          <TextField fullWidth label="Username" name="username" value={formData.username} onChange={handleInputChange} />
          <TextField fullWidth label="Пароль" name="password" type="password" value={formData.password} onChange={handleInputChange} />
          <FormControl fullWidth>
            <InputLabel>Роль</InputLabel>
            <Select name="role" value={formData.role} label="Роль" onChange={handleInputChange}>
              <MenuItem value="seller">Продавец</MenuItem>
              <MenuItem value="manager">Менеджер</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)} color="inherit">Отмена</Button>
          <Button onClick={handleCreateUser} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
