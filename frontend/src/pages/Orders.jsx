import { Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Checkbox, Avatar, Chip, TablePagination } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { PAGE_SIZE, formatCurrency, formatDate } from '../utils';

const Orders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlSearch = searchParams.get('search') ?? '';
  const urlPage1Based = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const page = urlPage1Based - 1; // 0-based for MUI

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    let cancelled = false;
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/orders/orders/?page=${urlPage1Based}&search=${encodeURIComponent(urlSearch)}`);
        if (cancelled) return;
        setOrders(response.data.results || response.data);
        setTotalCount(response.data.count || 0);
      } catch (error) {
        if (!cancelled) console.error("Failed to fetch orders:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOrders();
    return () => { cancelled = true; };
  }, [urlSearch, urlPage1Based]);

  const updateUrl = (nextSearch, nextPage0Based) => {
    const params = new URLSearchParams();
    params.set('search', nextSearch);
    params.set('page', String(nextPage0Based + 1));
    setSearchParams(params);
  };

  const handleSearch = () => {
    updateUrl(searchInput, 0);
  };

  const handlePageChange = (e, newPage) => {
    setSearchInput(urlSearch);
    updateUrl(urlSearch, newPage);
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Заказы</Typography>
      
      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ p: 3, display: 'flex', gap: 2, alignItems: 'center', borderBottom: '1px solid #EDF2F7' }}>
          <TextField 
            placeholder="Поиск" 
            size="small"
            sx={{ width: 300 }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" sx={{ color: '#1A202C', borderColor: '#E2E8F0', padding: '6px 24px' }} onClick={handleSearch}>
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
                <TableCell padding="checkbox"><Checkbox slotProps={{ input: { 'aria-label': 'Выбрать все заказы' } }} /></TableCell>
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: '#718096' }}>Загрузка…</TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: '#718096' }}>Нет заказов</TableCell>
                </TableRow>
              ) : (
                orders.map((row) => (
                  <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${row.id}`)}>
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox slotProps={{ input: { 'aria-label': 'Выбрать заказ' } }} onClick={(e) => e.stopPropagation()} />
                    </TableCell>
                    <TableCell sx={{ color: '#4A5568' }}>#{row.order_number}</TableCell>
                    <TableCell sx={{ color: '#4A5568' }}>{formatDate(row.order_date) || '—'}</TableCell>
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
                    <TableCell align="right" sx={{ color: '#4A5568' }}>{formatCurrency(row.total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={handlePageChange}
          rowsPerPage={PAGE_SIZE}
          onRowsPerPageChange={() => {}}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Paper>
    </Box>
  );
};

export default Orders;
