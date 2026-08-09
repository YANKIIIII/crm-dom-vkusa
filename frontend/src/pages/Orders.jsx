import { Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Checkbox, Select, MenuItem, Avatar, Chip, TablePagination } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { PAGE_SIZE } from '../utils';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const navigate = useNavigate();

  const fetchOrders = async () => {
    try {
      const response = await api.get(`/orders/orders/?page=${page + 1}&search=${search}`);
      setOrders(response.data.results || response.data);
      setTotalCount(response.data.count || 0);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page]); // Reload when page changes

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Заказы</Typography>
      
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
          <Button variant="outlined" sx={{ color: '#1A202C', borderColor: '#E2E8F0', padding: '6px 24px' }} onClick={() => { setPage(0); fetchOrders(); }}>
            ПОИСК
          </Button>
          <Button variant="contained" color="primary" onClick={() => navigate('/orders/new')}>
            НОВЫЙ ЗАКАЗ +
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox inputProps={{ 'aria-label': 'Выбрать все заказы' }} /></TableCell>
                <TableCell>№ Заказа</TableCell>
                <TableCell>Дата заказа</TableCell>
                <TableCell>Продавец</TableCell>
                <TableCell>Канал продажи</TableCell>
                <TableCell>Скидка</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right">Стоимость</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((row, i) => (
                <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${row.id}`)}>
                  <TableCell padding="checkbox"><Checkbox inputProps={{ 'aria-label': 'Выбрать заказ' }} /></TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>#{row.order_number}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.order_date}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 24, height: 24, fontSize: 10, bgcolor: '#CBD5E0', color: '#1A202C' }}>
                        {row.seller_name ? row.seller_name.substring(0, 2).toUpperCase() : 'ВА'}
                      </Avatar>
                      <Typography variant="body2">{row.seller_name || 'Неизвестно'}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.sales_channel_name}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.discount_percent}%</TableCell>
                  <TableCell>
                    <Chip 
                      label={row.status_display} 
                      size="small"
                      variant="outlined"
                      sx={{ 
                        color: row.status === 'cancelled' ? '#E53E3E' : (row.status === 'completed' ? '#38A169' : '#D69E2E'),
                        borderColor: row.status === 'cancelled' ? '#E53E3E' : (row.status === 'completed' ? '#38A169' : '#D69E2E'),
                        height: 24,
                        fontSize: '0.75rem'
                      }} 
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#4A5568' }}>{row.total} BYN</TableCell>
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

export default Orders;
