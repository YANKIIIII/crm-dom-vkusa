import { 
  Box, Typography, Paper, TextField, Button, Grid, CircularProgress, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Checkbox, Select, MenuItem, Avatar, Chip 
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

const ClientDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [orders, setOrders] = useState([]);
  const [channels, setChannels] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const channelsRes = await api.get('/orders/sales_channels/').catch(() => ({ data: [] }));
        setChannels(channelsRes.data.results || channelsRes.data || []);

        if (id !== 'new') {
          const [clientRes, ordersRes] = await Promise.all([
            api.get(`/clients/clients/${id}/`),
            api.get(`/orders/orders/?client=${id}`).catch(() => ({ data: [] }))
          ]);
          setClient(clientRes.data);
          setFormData(clientRes.data);
          setOrders(ordersRes.data.results || ordersRes.data || []);
        } else {
          setClient({}); // Empty client
          setOrders([]);
        }
      } catch (err) {
        console.error("Failed to load client details", err);
      } finally {
        if (id === 'new') setClient({});
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (id === 'new') {
        const res = await api.post(`/clients/clients/`, formData);
        alert("Новый клиент создан");
        navigate(`/clients/${res.data.id}`);
      } else {
        await api.put(`/clients/clients/${id}/`, formData);
        alert("Клиент сохранен");
      }
    } catch (err) {
      console.error("Failed to save client", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="50vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!client) {
    return <Typography>Клиент не найден</Typography>;
  }

  const fullName = `${formData.first_name || ''} ${formData.last_name || ''}`.trim() || 'Новый клиент';

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', pb: 10 }}>
      {/* Container simulating the outer white rounded background */}
      <Paper sx={{ p: 4, borderRadius: 4, backgroundColor: '#FFFFFF', boxShadow: 'none' }}>
        
        {/* Top Header with Save Button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
          <Button 
            variant="contained" 
            sx={{ 
              backgroundColor: '#CC5E33', 
              '&:hover': { backgroundColor: '#A84C28' },
              borderRadius: 1,
              textTransform: 'uppercase',
              px: 3
            }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <CircularProgress size={24} color="inherit" /> : 'СОХРАНИТЬ КЛИЕНТА'}
          </Button>
        </Box>

        {/* Client Info Card */}
        <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 4, p: 4, mb: 4 }}>
          {id !== 'new' && (
            <Typography variant="h4" sx={{ mb: 4, fontWeight: 500, color: '#1A202C' }}>
              {fullName}
            </Typography>
          )}

          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={3}>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Имя</Typography>
              <TextField 
                fullWidth 
                size="small"
                name="first_name" 
                value={formData.first_name || ''} 
                onChange={handleInputChange} 
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Фамилия</Typography>
              <TextField 
                fullWidth 
                size="small"
                name="last_name" 
                value={formData.last_name || ''} 
                onChange={handleInputChange} 
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Email</Typography>
              <TextField 
                fullWidth 
                size="small"
                name="email" 
                value={formData.email || ''} 
                onChange={handleInputChange} 
              />
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Дата первого заказа</Typography>
              <TextField 
                fullWidth 
                size="small"
                type="date" 
                name="first_purchase_date" 
                value={formData.first_purchase_date || ''} 
                onChange={handleInputChange} 
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Дата крайнего заказа</Typography>
              <TextField 
                fullWidth 
                size="small"
                type="date" 
                name="last_purchase_date" 
                value={formData.last_purchase_date || ''} 
                onChange={handleInputChange} 
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Канал привлечения</Typography>
              <Select 
                fullWidth 
                size="small"
                displayEmpty
                name="acquisition_source"
                value={formData.acquisition_source || ''}
                onChange={handleInputChange}
                sx={{ color: formData.acquisition_source ? '#1A202C' : '#718096' }}
              >
                <MenuItem value="" disabled>Не указан</MenuItem>
                {channels.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>День рождения</Typography>
              <TextField 
                fullWidth 
                size="small"
                type="date" 
                name="birth_date" 
                value={formData.birth_date || ''} 
                onChange={handleInputChange} 
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Скидка</Typography>
              <TextField 
                fullWidth 
                size="small"
                name="discount_percent" 
                value={formData.discount_percent || 0} 
                onChange={handleInputChange}
                InputProps={{
                  endAdornment: <Typography sx={{ color: '#718096', ml: 1 }}>%</Typography>
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Тип гриля</Typography>
              <TextField 
                fullWidth 
                size="small"
                name="grill_type" 
                value={formData.grill_type || ''} 
                onChange={handleInputChange} 
                placeholder="Например, Газовый"
              />
            </Grid>
          </Grid>
        </Box>

        {/* Order History Section */}
        <Box sx={{ mt: 6 }}>
          <Typography variant="h5" sx={{ mb: 4, fontWeight: 500, color: '#1A202C' }}>
            История заказов
          </Typography>

          <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 4, p: 3 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3 }}>
              <TextField 
                placeholder="Поиск" 
                size="small"
                sx={{ width: 250 }}
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
              <Button variant="outlined" sx={{ color: '#1A202C', borderColor: '#E2E8F0', padding: '6px 24px' }}>
                ПОИСК
              </Button>
              <Button 
                variant="contained" 
                sx={{ 
                  backgroundColor: '#CC5E33', 
                  '&:hover': { backgroundColor: '#A84C28' },
                  boxShadow: 'none'
                }} 
                onClick={() => navigate('/orders/new')}
              >
                НОВАЯ СДЕЛКА +
              </Button>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>№ Заказа</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Дата заказа</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Дата доставки</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Продавец</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Форма оплаты</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Канал продажи</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Скидка</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Статус</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }} align="right">Стоимость</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((row) => (
                    <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${row.id}`)}>
                      <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>#{row.order_number}</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.order_date}</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.completed_at ? row.completed_at.substring(0, 10) : ''}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 24, height: 24, fontSize: 10, bgcolor: '#CBD5E0', color: '#1A202C' }}>
                            {row.seller_name ? row.seller_name.substring(0, 2).toUpperCase() : 'ВА'}
                          </Avatar>
                          <Typography variant="body2">{row.seller_name || 'Неизвестно'}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.payment_type_name || 'Наличные'}</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.sales_channel_name}</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.discount_percent}%</TableCell>
                      <TableCell>
                        <Chip 
                          label={row.status_display || 'В доставке'} 
                          size="small"
                          variant="outlined"
                          sx={{ 
                            color: '#DD6B20',
                            borderColor: '#DD6B20',
                            height: 24,
                            fontSize: '0.75rem'
                          }} 
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#4A5568', fontWeight: 500 }}>{row.total} BYN</TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 3, color: '#718096' }}>
                        Нет заказов для данного клиента
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>

      </Paper>
    </Box>
  );
};

export default ClientDetail;
