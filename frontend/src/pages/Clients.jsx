import {
  Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Checkbox, Avatar, TablePagination,
  IconButton, Tooltip, CircularProgress,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useFeedback } from '../components/FeedbackProvider';
import { PAGE_SIZE, formatCurrency, formatDate, extractApiError } from '../utils';

const Clients = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify, confirm } = useFeedback();
  const isManager = localStorage.getItem('user_role') === 'manager';

  const urlSearch = searchParams.get('search') ?? '';
  const urlPage1Based = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const page = urlPage1Based - 1;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [clients, setClients] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    let cancelled = false;
    const fetchClients = async () => {
      setLoading(true);
      try {
        const response = await api.get(
          `/clients/clients/?page=${urlPage1Based}&search=${encodeURIComponent(urlSearch)}`
        );
        if (cancelled) return;
        setClients(response.data.results || response.data);
        setTotalCount(response.data.count || 0);
        setSelectedIds(new Set());
      } catch (error) {
        if (!cancelled) console.error('Failed to fetch clients:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchClients();
    return () => {
      cancelled = true;
    };
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

  const pageIds = useMemo(() => clients.map((c) => c.id), [clients]);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id));
  const allPageSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = (checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) pageIds.forEach((id) => next.add(id));
      else pageIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const deleteClientsByIds = async (ids) => {
    if (!ids.length) return;
    if (!(await confirm(`Удалить выбранных клиентов (${ids.length})?`))) return;

    setDeleting(true);
    const errors = [];
    try {
      for (const id of ids) {
        try {
          await api.delete(`/clients/clients/${id}/`);
        } catch (err) {
          const client = clients.find((c) => c.id === id);
          const label = client
            ? `${client.first_name || ''} ${client.last_name || ''}`.trim() || `#${id}`
            : `#${id}`;
          errors.push(`${label}: ${extractApiError(err)}`);
        }
      }
      const response = await api.get(
        `/clients/clients/?page=${urlPage1Based}&search=${encodeURIComponent(urlSearch)}`
      );
      setClients(response.data.results || response.data);
      setTotalCount(response.data.count || 0);
      setSelectedIds(new Set());
      if (errors.length) {
        notify(`Часть клиентов не удалена:\n${errors.join('\n')}`, 'error');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = () => {
    if (!isManager || selectedIds.size === 0) return;
    deleteClientsByIds([...selectedIds]);
  };

  const handleDeleteOne = (e, client) => {
    e.stopPropagation();
    if (!isManager) return;
    deleteClientsByIds([client.id]);
  };

  const colCount = isManager ? 10 : 9;

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
          {isManager && selectedIds.size > 0 && (
            <Button
              variant="outlined"
              color="error"
              disabled={deleting}
              onClick={handleDeleteSelected}
            >
              {deleting ? (
                <CircularProgress size={22} color="inherit" />
              ) : (
                `Удалить выбранных (${selectedIds.size})`
              )}
            </Button>
          )}
          <Button
            variant="outlined"
            sx={{ color: '#1A202C', borderColor: '#E2E8F0', padding: '6px 24px' }}
            onClick={handleSearch}
          >
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
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={allPageSelected}
                    indeterminate={somePageSelected}
                    onChange={(e) => toggleAllOnPage(e.target.checked)}
                    disabled={loading || clients.length === 0 || deleting}
                    slotProps={{ input: { 'aria-label': 'Выбрать всех клиентов на странице' } }}
                  />
                </TableCell>
                <TableCell>ФИО</TableCell>
                <TableCell>Телефон</TableCell>
                <TableCell>Скидка</TableCell>
                <TableCell>Канал продажи</TableCell>
                <TableCell>Тип гриля</TableCell>
                <TableCell>Первый заказ</TableCell>
                <TableCell>Крайний заказ</TableCell>
                <TableCell align="right">Бюджет</TableCell>
                {isManager && <TableCell align="right">Действия</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={colCount} align="center" sx={{ py: 4, color: '#718096' }}>
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} align="center" sx={{ py: 4, color: '#718096' }}>
                    Нет клиентов
                  </TableCell>
                </TableRow>
              ) : (
                clients.map((row) => {
                  const checked = selectedIds.has(row.id);
                  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
                  return (
                    <TableRow
                      key={row.id}
                      hover
                      selected={checked}
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/clients/${row.id}`)}
                    >
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={checked}
                          onChange={() => toggleOne(row.id)}
                          disabled={deleting}
                          slotProps={{ input: { 'aria-label': `Выбрать клиента ${name || row.id}` } }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ width: 28, height: 28, fontSize: 11, bgcolor: '#CBD5E0', color: '#1A202C' }}>
                            {row.first_name ? row.first_name.charAt(0) : ''}
                            {row.last_name ? row.last_name.charAt(0) : ''}
                          </Avatar>
                          <Typography variant="body2" sx={{ color: '#4A5568' }}>
                            {row.first_name} {row.last_name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.primary_phone || '—'}</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.discount_percent}%</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.acquisition_source || '—'}</TableCell>
                      <TableCell>
                        {row.grill_type_display ? (
                          <Box
                            sx={{
                              bgcolor: '#EDF2F7',
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 4,
                              display: 'inline-block',
                              fontSize: '0.85rem',
                              color: '#4A5568',
                            }}
                          >
                            {row.grill_type_display}
                          </Box>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>
                        {formatDate(row.first_purchase_date) || '—'}
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>
                        {formatDate(row.last_purchase_date) || '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#4A5568' }}>
                        {formatCurrency(row.total_budget)}
                      </TableCell>
                      {isManager && (
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="Удалить клиента">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Удалить клиента ${name || row.id}`}
                                disabled={deleting}
                                onClick={(e) => handleDeleteOne(e, row)}
                              >
                                <span className="material-icons" style={{ fontSize: 20 }}>
                                  delete
                                </span>
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
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
