import {
  Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Checkbox, Avatar, TablePagination,
  IconButton, Tooltip, CircularProgress,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useFeedback } from '../hooks/useFeedback';
import {
  PAGE_SIZE, PAGE_SIZE_OPTIONS, formatCurrency, formatDate, extractApiError,
  toggleOrdering, buildListQuery, CATALOG_PAGE_SIZE, unwrapList, GRILL_TYPE_LABELS,
  toRangeQuery, rangeInputFromQuery,
} from '../utils';
import SortableHeader from '../components/SortableHeader';
import SearchableSelect from '../components/SearchableSelect';
import CompareFilter from '../components/CompareFilter';
import TruncatedText from '../components/TruncatedText';

const GRILL_TYPE_FILTERS = [
  { value: '', label: 'Все' },
  ...Object.entries(GRILL_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const Clients = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify, confirm } = useFeedback();
  const isManager = localStorage.getItem('user_role') === 'manager';

  const urlSearch = searchParams.get('search') ?? '';
  const urlOrdering = searchParams.get('ordering') || '-id';
  const urlPage1Based = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const urlPageSize = PAGE_SIZE_OPTIONS.includes(Number(searchParams.get('page_size')))
    ? Number(searchParams.get('page_size'))
    : PAGE_SIZE;
  const urlGrillType = searchParams.get('grill_type') ?? '';
  const urlChannel = searchParams.get('acquisition_source') ?? '';
  const urlPurchaseAfter = searchParams.get('last_purchase_after') ?? '';
  const urlPurchaseBefore = searchParams.get('last_purchase_before') ?? '';
  const urlPurchaseOp = searchParams.get('purchase_op') ?? '';
  const purchaseRange = rangeInputFromQuery(urlPurchaseAfter, urlPurchaseBefore, urlPurchaseOp);
  const page = urlPage1Based - 1;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [clients, setClients] = useState([]);
  const [channels, setChannels] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    let cancelled = false;
    api.get('/orders/sales_channels/', { params: { page_size: CATALOG_PAGE_SIZE } })
      .then((response) => {
        if (!cancelled) setChannels(unwrapList(response.data));
      })
      .catch(() => {
        if (!cancelled) setChannels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchClients = async () => {
      setLoading(true);
      try {
        const response = await api.get(
          `/clients/clients/?${buildListQuery({
            page: urlPage1Based,
            pageSize: urlPageSize,
            search: urlSearch,
            ordering: urlOrdering,
            extra: {
              grill_type: urlGrillType,
              acquisition_source: urlChannel,
              last_purchase_after: urlPurchaseAfter,
              last_purchase_before: urlPurchaseBefore,
            },
          })}`
        );
        if (cancelled) return;
        setClients(response.data.results || response.data);
        setTotalCount(response.data.count || 0);
        setSelectedIds(new Set());
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(extractApiError(error));
          notify(`Не удалось загрузить клиентов:\n${extractApiError(error)}`, 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchClients();
    return () => {
      cancelled = true;
    };
  }, [urlSearch, urlPage1Based, urlPageSize, urlOrdering, urlGrillType, urlChannel, urlPurchaseAfter, urlPurchaseBefore, notify]);

  const updateUrl = (next) => {
    const params = new URLSearchParams();
    params.set('search', next.search ?? urlSearch);
    params.set('page', String((next.page0Based ?? page) + 1));
    params.set('page_size', String(next.pageSize ?? urlPageSize));
    params.set('ordering', next.ordering ?? urlOrdering);
    const grillType = next.grillType === undefined ? urlGrillType : next.grillType;
    const channel = next.channel === undefined ? urlChannel : next.channel;
    const purchaseAfter = next.purchaseAfter === undefined ? urlPurchaseAfter : next.purchaseAfter;
    const purchaseBefore = next.purchaseBefore === undefined ? urlPurchaseBefore : next.purchaseBefore;
    const purchaseOp = next.purchaseOp === undefined ? urlPurchaseOp : next.purchaseOp;
    if (grillType) params.set('grill_type', grillType);
    if (channel) params.set('acquisition_source', channel);
    if (purchaseOp) params.set('purchase_op', purchaseOp);
    if (purchaseAfter) params.set('last_purchase_after', purchaseAfter);
    if (purchaseBefore) params.set('last_purchase_before', purchaseBefore);
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
        `/clients/clients/?${buildListQuery({
          page: urlPage1Based,
          pageSize: urlPageSize,
          search: urlSearch,
          ordering: urlOrdering,
          extra: {
            grill_type: urlGrillType,
            acquisition_source: urlChannel,
            last_purchase_after: urlPurchaseAfter,
            last_purchase_before: urlPurchaseBefore,
          },
        })}`
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

  const colCount = isManager ? 11 : 10;

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Клиенты</Typography>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #EDF2F7' }}>
          <TextField
            placeholder="Поиск…"
            size="small"
            sx={{ width: 160, flex: '0 0 160px' }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            slotProps={{ input: { 'aria-label': 'Поиск клиентов' } }}
          />
          <Box sx={{ minWidth: 140, flex: '0 1 160px' }}>
            <SearchableSelect
              id="clients-grill-filter"
              label="Тип гриля"
              value={urlGrillType}
              onChange={(value) => updateUrl({ search: urlSearch, page0Based: 0, grillType: value })}
              options={GRILL_TYPE_FILTERS}
            />
          </Box>
          <Box sx={{ minWidth: 180, flex: '0 1 180px' }}>
            <SearchableSelect
              id="clients-channel-filter"
              label="Канал продажи"
              value={urlChannel}
              onChange={(value) => updateUrl({ search: urlSearch, page0Based: 0, channel: value })}
              options={[
                { value: '', label: 'Все' },
                ...channels.map((c) => ({ value: c.name, label: c.name })),
              ]}
            />
          </Box>
          <CompareFilter
            id="clients-purchase"
            label="Покупка"
            type="date"
            op={purchaseRange.op}
            onOpChange={(next) => {
              if (!next) {
                updateUrl({ search: urlSearch, page0Based: 0, purchaseOp: '', purchaseAfter: '', purchaseBefore: '' });
                return;
              }
              const range = toRangeQuery(next, purchaseRange.from, next === 'between' ? purchaseRange.to : '');
              updateUrl({
                search: urlSearch,
                page0Based: 0,
                purchaseOp: next,
                purchaseAfter: range.min,
                purchaseBefore: range.max,
              });
            }}
            value={purchaseRange.from}
            valueTo={purchaseRange.to}
            onRangeChange={(from, to) => {
              const range = toRangeQuery(purchaseRange.op, from, to);
              updateUrl({
                search: urlSearch,
                page0Based: 0,
                purchaseOp: purchaseRange.op,
                purchaseAfter: range.min,
                purchaseBefore: range.max,
              });
            }}
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

        <TableContainer sx={{ overflowX: 'auto' }}>
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
                <SortableHeader field="last_name" label="ФИО" ordering={urlOrdering} onSort={handleSort} />
                <TableCell>Телефон</TableCell>
                <SortableHeader field="email" label="Email" ordering={urlOrdering} onSort={handleSort} />
                <SortableHeader field="discount_percent" label="Скидка" ordering={urlOrdering} onSort={handleSort} />
                <TableCell>Канал продажи</TableCell>
                <TableCell>Тип гриля</TableCell>
                <SortableHeader field="first_purchase_date" label="Первый заказ" ordering={urlOrdering} onSort={handleSort} defaultDesc />
                <SortableHeader field="last_purchase_date" label="Крайний заказ" ordering={urlOrdering} onSort={handleSort} defaultDesc />
                <SortableHeader field="total_budget" label="Бюджет" ordering={urlOrdering} onSort={handleSort} align="right" defaultDesc />
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
                    Не удалось загрузить клиентов
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
                      <TableCell sx={{ color: '#4A5568' }} onClick={(e) => e.stopPropagation()}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ width: 28, height: 28, fontSize: 11, bgcolor: '#CBD5E0', color: '#1A202C' }}>
                            {row.first_name ? row.first_name.charAt(0) : ''}
                            {row.last_name ? row.last_name.charAt(0) : ''}
                          </Avatar>
                          <Box
                            component={RouterLink}
                            to={`/clients/${row.id}`}
                            aria-label={`Открыть клиента ${name || row.id}`}
                            sx={{
                              color: 'inherit',
                              textDecoration: 'none',
                              fontWeight: 500,
                              maxWidth: 220,
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            <TruncatedText>{name}</TruncatedText>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.primary_phone || '—'}</TableCell>
                      <TableCell sx={{ color: '#4A5568', maxWidth: 180 }}><TruncatedText>{row.email || '—'}</TruncatedText></TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.discount_percent}%</TableCell>
                      <TableCell sx={{ color: '#4A5568', maxWidth: 160 }}><TruncatedText>{row.acquisition_source || '—'}</TruncatedText></TableCell>
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

export default Clients;
