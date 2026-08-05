import { Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Checkbox, Select, MenuItem, Avatar, TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { extractApiError, PAGE_SIZE } from '../utils';

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const navigate = useNavigate();

  const fetchClients = async () => {
    try {
      const response = await api.get(`/clients/clients/?page=${page + 1}&search=${search}`);
      setClients(response.data.results || response.data);
      setTotalCount(response.data.count || 0);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [page]); // Reload when page changes

  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleCreateClient = async () => {
    setLoading(true);
    try {
      await api.post('/clients/clients/', formData);
      setOpenModal(false);
      fetchClients();
    } catch (error) {
      console.error("Failed to create client", error);
      alert(`Не удалось создать клиента:\n${extractApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Клиенты</Typography>
      
      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ p: 3, display: 'flex', gap: 2, alignItems: 'center', borderBottom: '1px solid #EDF2F7' }}>
          <TextField 
            placeholder="Поиск" 
            size="small"
            sx={{ width: 300 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select 
            value="" 
            displayEmpty 
            size="small" 
            sx={{ width: 200, color: '#718096' }}
          >
            <MenuItem value="">Фильтр</MenuItem>
          </Select>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" sx={{ color: '#1A202C', borderColor: '#E2E8F0', padding: '6px 24px' }} onClick={() => { setPage(0); fetchClients(); }}>
            ПОИСК
          </Button>
          <Button variant="contained" color="primary" onClick={() => navigate('/clients/new')}>
            НОВЫЙ КЛИЕНТ +
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox /></TableCell>
                <TableCell>ФИО</TableCell>
                <TableCell>Телефон</TableCell>
                <TableCell>Скидка</TableCell>
                <TableCell>Канал продажи</TableCell>
                <TableCell>Тип гриля</TableCell>
                <TableCell>Первый заказ</TableCell>
                <TableCell>Крайний заказ</TableCell>
                <TableCell align="right">Бюджет</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clients.map((row, i) => (
                <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/clients/${row.id}`)}>
                  <TableCell padding="checkbox"><Checkbox /></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: 11, bgcolor: '#CBD5E0', color: '#1A202C' }}>
                        {row.first_name ? row.first_name.charAt(0) : ''}{row.last_name ? row.last_name.charAt(0) : ''}
                      </Avatar>
                      <Typography variant="body2" sx={{ color: '#4A5568' }}>{row.first_name} {row.last_name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.primary_phone || '—'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.discount_percent}%</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.acquisition_source || '—'}</TableCell>
                  <TableCell>
                    {row.grill_type_display ? (
                      <Box sx={{ bgcolor: '#EDF2F7', px: 1.5, py: 0.5, borderRadius: 4, display: 'inline-block', fontSize: '0.85rem', color: '#4A5568' }}>
                        {row.grill_type_display}
                      </Box>
                    ) : '—'}
                  </TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.first_purchase_date || '—'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.last_purchase_date || '—'}</TableCell>
                  <TableCell align="right" sx={{ color: '#4A5568' }}>{row.total_budget} BYN</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={PAGE_SIZE}
          onRowsPerPageChange={() => {}}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Paper>
    </Box>
  );
};

export default Clients;
