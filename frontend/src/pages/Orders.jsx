import {
  Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Checkbox, Avatar, Chip, TablePagination,
  IconButton, Tooltip, CircularProgress,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useFeedback } from '../hooks/useFeedback';
import { PAGE_SIZE, formatCurrency, formatDate, extractApiError } from '../utils';

const isDeletableStatus = (status) => status !== 'completed';

const Orders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify, confirm } = useFeedback();
  const isManager = localStorage.getItem('user_role') === 'manager';

  const urlSearch = searchParams.get('search') ?? '';
  const urlPage1Based = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const page = urlPage1Based - 1;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    let cancelled = false;
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const response = await api.get(
          `/orders/orders/?page=${urlPage1Based}&search=${encodeURIComponent(urlSearch)}`
        );
        if (cancelled) return;
        setOrders(response.data.results || response.data);
        setTotalCount(response.data.count || 0);
        setSelectedIds(new Set());
      } catch (error) {
        if (!cancelled) console.error('Failed to fetch orders:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOrders();
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

  const pageIds = useMemo(() => orders.map((o) => o.id), [orders]);
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

  const deleteOrdersByIds = async (ids) => {
    const targets = orders.filter((o) => ids.includes(o.id));
    const blocked = targets.filter((o) => !isDeletableStatus(o.status));
    const allowed = targets.filter((o) => isDeletableStatus(o.status));

    if (blocked.length && !allowed.length) {
      notify('Нельзя удалить завершённые заказы.', 'warning');
      return;
    }

    const confirmMsg = blocked.length
      ? `Удалить ${allowed.length} заказ(ов)? ${blocked.length} завершённых будут пропущены.`
      : `Удалить выбранные заказы (${allowed.length})? Товар вернётся на склад (если заказ не отменён).`;

    if (!(await confirm(confirmMsg))) return;

    setDeleting(true);
    const errors = [];
    try {
      for (const order of allowed) {
        try {
          await api.delete(`/orders/orders/${order.id}/`);
        } catch (err) {
          errors.push(`#${order.order_number}: ${extractApiError(err)}`);
        }
      }
      const response = await api.get(
        `/orders/orders/?page=${urlPage1Based}&search=${encodeURIComponent(urlSearch)}`
      );
      setOrders(response.data.results || response.data);
      setTotalCount(response.data.count || 0);
      setSelectedIds(new Set());
      if (errors.length) {
        notify(`Часть заказов не удалена:\n${errors.join('\n')}`, 'error');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = () => {
    if (!isManager || selectedIds.size === 0) return;
    deleteOrdersByIds([...selectedIds]);
  };

  const handleDeleteOne = (e, order) => {
    e.stopPropagation();
    if (!isManager) return;
    if (!isDeletableStatus(order.status)) {
      notify('Нельзя удалить завершённый заказ.', 'warning');
      return;
    }
    deleteOrdersByIds([order.id]);
  };

  const colCount = isManager ? 9 : 8;

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Заказы</Typography>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ p: 3, display: 'flex', gap: 2, alignItems: 'center', borderBottom: '1px solid #EDF2F7' }}>
          <TextField
            placeholder="Поиск…"
            size="small"
            sx={{ width: 300 }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            slotProps={{ input: { 'aria-label': 'Поиск заказов' } }}
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
                `Удалить выбранные (${selectedIds.size})`
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
          <Button variant="contained" color="primary" onClick={() => navigate('/orders/new')}>
            НОВЫЙ ЗАКАЗ +
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
                    disabled={loading || orders.length === 0 || deleting}
                    slotProps={{ input: { 'aria-label': 'Выбрать все заказы на странице' } }}
                  />
                </TableCell>
                <TableCell>№ Заказа</TableCell>
                <TableCell>Дата заказа</TableCell>
                <TableCell>Продавец</TableCell>
                <TableCell>Канал продажи</TableCell>
                <TableCell>Скидка</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right">Стоимость</TableCell>
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
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} align="center" sx={{ py: 4, color: '#718096' }}>
                    Нет заказов
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((row) => {
                  const checked = selectedIds.has(row.id);
                  const canDelete = isManager && isDeletableStatus(row.status);
                  return (
                    <TableRow
                      key={row.id}
                      hover
                      selected={checked}
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/orders/${row.id}`)}
                    >
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={checked}
                          onChange={() => toggleOne(row.id)}
                          disabled={deleting}
                          slotProps={{ input: { 'aria-label': `Выбрать заказ ${row.order_number}` } }}
                        />
                      </TableCell>
                      <TableCell
                        sx={{ color: '#4A5568' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/orders/${row.id}`);
                        }}
                      >
                        <Box
                          component="span"
                          role="link"
                          tabIndex={0}
                          aria-label={`Открыть заказ ${row.order_number}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/orders/${row.id}`);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate(`/orders/${row.id}`);
                            }
                          }}
                        >
                          #{row.order_number}
                        </Box>
                      </TableCell>
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
                            color:
                              row.status === 'cancelled'
                                ? '#E53E3E'
                                : row.status === 'completed'
                                  ? '#38A169'
                                  : '#D69E2E',
                            borderColor:
                              row.status === 'cancelled'
                                ? '#E53E3E'
                                : row.status === 'completed'
                                  ? '#38A169'
                                  : '#D69E2E',
                            height: 24,
                            fontSize: '0.75rem',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#4A5568' }}>
                        {formatCurrency(row.total)}
                      </TableCell>
                      {isManager && (
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          <Tooltip
                            title={
                              canDelete
                                ? 'Удалить заказ'
                                : 'Завершённый заказ нельзя удалить'
                            }
                          >
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Удалить заказ ${row.order_number}`}
                                disabled={!canDelete || deleting}
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

export default Orders;
