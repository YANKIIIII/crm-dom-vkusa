import { Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Checkbox, Avatar, TablePagination } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { PAGE_SIZE, formatCurrency, formatDate } from '../utils';

const Clients = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlSearch = searchParams.get('search') ?? '';
  const urlPage1Based = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const page = urlPage1Based - 1; // 0-based for MUI

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [clients, setClients] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    let cancelled = false;
    const fetchClients = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/clients/clients/?page=${urlPage1Based}&search=${encodeURIComponent(urlSearch)}`);
        if (cancelled) return;
        setClients(response.data.results || response.data);
        setTotalCount(response.data.count || 0);
      } catch (error) {
        if (!cancelled) console.error("Failed to fetch clients:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchClients();
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
      <Typography variant="h4" sx={{ mb: 4 }}>Клиенты</Typography>
      
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
          <Button variant="contained" color="primary" onClick={() => navigate('/clients/new')}>
            НОВЫЙ КЛИЕНТ +
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox slotProps={{ input: { 'aria-label': 'Выбрать всех клиентов' } }} /></TableCell>
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: '#718096' }}>Загрузка…</TableCell>
                </TableRow>
              ) : clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: '#718096' }}>Нет клиентов</TableCell>
                </TableRow>
              ) : (
                clients.map((row) => (
                  <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/clients/${row.id}`)}>
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox slotProps={{ input: { 'aria-label': 'Выбрать клиента' } }} onClick={(e) => e.stopPropagation()} />
                    </TableCell>
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
                    <TableCell sx={{ color: '#4A5568' }}>{formatDate(row.first_purchase_date) || '—'}</TableCell>
                    <TableCell sx={{ color: '#4A5568' }}>{formatDate(row.last_purchase_date) || '—'}</TableCell>
                    <TableCell align="right" sx={{ color: '#4A5568' }}>{formatCurrency(row.total_budget)}</TableCell>
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

export default Clients;
