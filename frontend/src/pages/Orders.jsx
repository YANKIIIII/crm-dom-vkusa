import {
  Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Checkbox, Avatar, Chip, TablePagination,
  IconButton, Tooltip, CircularProgress,
  Tabs, Tab,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useFeedback } from '../hooks/useFeedback';
import {
  PAGE_SIZE, PAGE_SIZE_OPTIONS, formatCurrency, formatDate, extractApiError,
  toggleOrdering, buildListQuery, CATALOG_PAGE_SIZE, mapOrderStatuses, unwrapList,
} from '../utils';
import SortableHeader from '../components/SortableHeader';
import SearchableSelect from '../components/SearchableSelect';
import TruncatedText from '../components/TruncatedText';

const isDeletableStatus = (status, statuses) => {
  const row = statuses.find((item) => item.value === status || item.code === status);
  if (row?.kind) return row.kind !== 'completed';
  return status !== 'completed';
};

const Orders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify, confirm } = useFeedback();
  const isManager = localStorage.getItem('user_role') === 'manager';

  const urlSearch = searchParams.get('search') ?? '';
  const urlView = searchParams.get('view') === 'unassigned' ? 'unassigned' : 'all';
  const urlStatus = searchParams.get('status') ?? '';
  const urlOrdering = searchParams.get('ordering') || '-id';
  const urlPage1Based = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const urlPageSize = PAGE_SIZE_OPTIONS.includes(Number(searchParams.get('page_size')))
    ? Number(searchParams.get('page_size'))
    : PAGE_SIZE;
  const page = urlPage1Based - 1;
  const effectiveStatus = urlView === 'unassigned' ? 'reserved' : urlStatus;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [orderStatuses, setOrderStatuses] = useState(() => mapOrderStatuses([]));

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    let cancelled = false;
    api.get('/orders/order_statuses/', { params: { page_size: CATALOG_PAGE_SIZE } })
      .then((response) => {
        if (!cancelled) setOrderStatuses(mapOrderStatuses(unwrapList(response.data)));
      })
      .catch(() => {
        if (!cancelled) setOrderStatuses(mapOrderStatuses([]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const response = await api.get(
          `/orders/orders/?${buildListQuery({
            page: urlPage1Based,
            pageSize: urlPageSize,
            search: urlSearch,
            ordering: urlOrdering,
            extra: { status: effectiveStatus },
          })}`
        );
        if (cancelled) return;
        setOrders(response.data.results || response.data);
        setTotalCount(response.data.count || 0);
        setSelectedIds(new Set());
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(extractApiError(error));
          notify(`Не удалось загрузить заказы:\n${extractApiError(error)}`, 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOrders();
    return () => {
      cancelled = true;
    };
  }, [urlSearch, urlPage1Based, urlPageSize, urlOrdering, effectiveStatus, notify]);

  const updateUrl = (next) => {
    const params = new URLSearchParams();
    params.set('search', next.search ?? urlSearch);
    params.set('page', String((next.page0Based ?? page) + 1));
    params.set('page_size', String(next.pageSize ?? urlPageSize));
    params.set('ordering', next.ordering ?? urlOrdering);
    const view = next.view === undefined ? urlView : next.view;
    if (view === 'unassigned') params.set('view', 'unassigned');
    const status = next.status === undefined ? urlStatus : next.status;
    if (view !== 'unassigned' && status) params.set('status', status);
    setSearchParams(params);
  };

  const handleSearch = () => {
    updateUrl({ search: searchInput, page0Based: 0 });
  };

  const handlePageChange = (e, newPage) => {
    setSearchInput(urlSearch);
    updateUrl({ search: urlSearch, page0Based: newPage });
  };

  const handlePageSizeChange = (e) => {
    updateUrl({ search: urlSearch, page0Based: 0, pageSize: Number(e.target.value) });
  };

  const handleSort = (field, defaultDesc) => {
    updateUrl({
      search: urlSearch,
      page0Based: 0,
      ordering: toggleOrdering(urlOrdering, field, defaultDesc),
    });
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
    const blocked = targets.filter((o) => !isDeletableStatus(o.status, orderStatuses));
    const allowed = targets.filter((o) => isDeletableStatus(o.status, orderStatuses));

    if (blocked.length && !allowed.length) {
      notify('Нельзя удалить завершённые заказы.', 'warning');
      return;
    }

    const confirmMsg = blocked.length
      ? `Удалить ${allowed.length} заказ(ов)? ${blocked.length} завершённых будут пропущены.`
      : `Удалить выбранные заказы (${allowed.length})?`;

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
          `/orders/orders/?${buildListQuery({
            page: urlPage1Based,
            pageSize: urlPageSize,
            search: urlSearch,
            ordering: urlOrdering,
            extra: { status: effectiveStatus },
          })}`
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
    if (!isDeletableStatus(order.status, orderStatuses)) {
      notify('Нельзя удалить завершённый заказ.', 'warning');
      return;
    }
    deleteOrdersByIds([order.id]);
  };

  const colCount = isManager ? 10 : 9;

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Заказы</Typography>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Tabs
          value={urlView}
          onChange={(_, next) => updateUrl({ search: urlSearch, page0Based: 0, view: next, status: '' })}
          sx={{ px: 2, borderBottom: '1px solid #EDF2F7' }}
        >
          <Tab value="all" label="Все заказы" />
          <Tab value="unassigned" label="Нераспределённые" />
        </Tabs>
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
          {urlView !== 'unassigned' && (
          <Box sx={{ minWidth: 200 }}>
            <SearchableSelect
              id="orders-status-filter"
              label="Статус"
              value={urlStatus}
              onChange={(value) => updateUrl({ search: urlSearch, page0Based: 0, view: 'all', status: value })}
              options={[
                { value: '', label: 'Все' },
                ...orderStatuses.map((s) => ({ value: s.value, label: s.label })),
              ]}
            />
          </Box>
          )}
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

        <TableContainer sx={{ overflowX: 'auto' }}>
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
                <SortableHeader field="order_number" label="№ Заказа" ordering={urlOrdering} onSort={handleSort} />
                <SortableHeader field="order_date" label="Дата заказа" ordering={urlOrdering} onSort={handleSort} defaultDesc />
                <SortableHeader field="client__last_name" label="Клиент" ordering={urlOrdering} onSort={handleSort} />
                <SortableHeader field="seller__first_name" label="Продавец" ordering={urlOrdering} onSort={handleSort} />
                <TableCell>Канал продажи</TableCell>
                <SortableHeader field="discount_percent" label="Скидка" ordering={urlOrdering} onSort={handleSort} />
                <SortableHeader field="status" label="Статус" ordering={urlOrdering} onSort={handleSort} />
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
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={colCount} align="center" sx={{ py: 4, color: '#E53E3E' }}>
                    Не удалось загрузить заказы
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
                  const canDelete = isManager && isDeletableStatus(row.status, orderStatuses);
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
                      <TableCell sx={{ color: '#4A5568' }} onClick={(e) => e.stopPropagation()}>
                        <Box
                          component={RouterLink}
                          to={`/orders/${row.id}`}
                          aria-label={`Открыть заказ ${row.order_number}`}
                          sx={{
                            color: 'inherit',
                            textDecoration: 'none',
                            fontWeight: 500,
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          #{row.order_number}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{formatDate(row.order_date) || '—'}</TableCell>
                      <TableCell sx={{ color: '#4A5568', maxWidth: 200 }}>
                        <TruncatedText>
                          {[row.client_last_name, row.client_name].filter(Boolean).join(' ') || '—'}
                        </TruncatedText>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 24, height: 24, fontSize: 10, bgcolor: '#CBD5E0', color: '#1A202C' }}>
                            {row.seller_name ? row.seller_name.substring(0, 2).toUpperCase() : 'ВА'}
                          </Avatar>
                          <Typography variant="body2"><TruncatedText>{row.seller_name || 'Неизвестно'}</TruncatedText></Typography>
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
                                <span className="material-icons" style={{ fontSize: 20 }} aria-hidden="true">
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
          rowsPerPage={urlPageSize}
          onRowsPerPageChange={handlePageSizeChange}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
        />
      </Paper>
    </Box>
  );
};

export default Orders;
