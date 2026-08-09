import { Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Select, MenuItem, TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Autocomplete, Alert } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { extractApiError, PAGE_SIZE } from '../utils';

const getTagChipSx = (tag) => {
  if (tag === 'Товар заканчивается') {
    return { bgcolor: '#FEEBC8', color: '#DD6B20' };
  }
  if (tag === 'Нет в наличии') {
    return { bgcolor: '#FED7D7', color: '#E53E3E' };
  }
  return { bgcolor: '#EDF2F7', color: '#4A5568' };
};

const Warehouse = () => {
  const isManager = localStorage.getItem('user_role') === 'manager';
  const [stockItems, setStockItems] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [stockQuantity, setStockQuantity] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productOptions, setProductOptions] = useState([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [qtyDrafts, setQtyDrafts] = useState({});
  const [savingQtyIds, setSavingQtyIds] = useState(() => new Set());
  const searchTimerRef = useRef(null);
  const productSearchSeqRef = useRef(0);

  const fetchStock = async () => {
    try {
      const response = await api.get(`/warehouse/stock_items/?page=${page + 1}&search=${search}`);
      setStockItems(response.data.results || response.data);
      setTotalCount(response.data.count || 0);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProductOptions = async (search = '') => {
    const requestId = ++productSearchSeqRef.current;
    setProductSearchLoading(true);
    try {
      const params = search ? { search } : {};
      const res = await api.get('/catalog/product_cards/', { params });
      if (requestId !== productSearchSeqRef.current) return;
      setProductOptions(res.data.results || res.data);
    } catch (err) {
      if (requestId !== productSearchSeqRef.current) return;
      console.error('Failed to load products', err);
    } finally {
      if (requestId === productSearchSeqRef.current) {
        setProductSearchLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchStock();
  }, [page]);

  const handleSearch = () => {
    if (page !== 0) {
      setPage(0);
    } else {
      fetchStock();
    }
  };

  useEffect(() => {
    if (openModal) {
      setSelectedProduct(null);
      setStockQuantity(0);
      setFormError(null);
      loadProductOptions();
    }
  }, [openModal]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  const handleProductInputChange = (_event, value, reason) => {
    if (reason !== 'input') return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadProductOptions(value.trim());
    }, 300);
  };

  const handleCreateStock = async () => {
    if (!selectedProduct) {
      setFormError('Выберите товар');
      return;
    }
    setLoading(true);
    setFormError(null);
    try {
      await api.post('/warehouse/stock_items/', {
        product_card: selectedProduct.id,
        stock_quantity: Number(stockQuantity) || 0,
      });
      setOpenModal(false);
      fetchStock();
    } catch (error) {
      console.error("Failed to add stock", error);
      setFormError(`Не удалось добавить приход: ${extractApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (itemId, value) => {
    setQtyDrafts(prev => ({ ...prev, [itemId]: value }));
  };

  const clearQtyDraftIfUnchanged = (itemId, expectedDraft) => {
    setQtyDrafts(prev => {
      if (prev[itemId] !== expectedDraft) return prev;
      const nextDrafts = { ...prev };
      delete nextDrafts[itemId];
      return nextDrafts;
    });
  };

  const handleQtySave = async (item) => {
    const draft = qtyDrafts[item.id];
    if (draft === undefined) return;
    const next = Number(draft);
    if (!Number.isFinite(next) || next < 0 || next === item.stock_quantity) {
      clearQtyDraftIfUnchanged(item.id, draft);
      return;
    }
    setSavingQtyIds(prev => new Set(prev).add(item.id));
    try {
      await api.patch(`/warehouse/stock_items/${item.id}/`, { stock_quantity: next });
      clearQtyDraftIfUnchanged(item.id, draft);
      fetchStock();
    } catch (error) {
      console.error('Failed to update quantity', error);
      alert(`Не удалось обновить остаток:\n${extractApiError(error)}`);
    } finally {
      setSavingQtyIds(prev => {
        const nextIds = new Set(prev);
        nextIds.delete(item.id);
        return nextIds;
      });
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Склад (Остатки)</Typography>
      
      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ p: 3, display: 'flex', gap: 2, alignItems: 'center', borderBottom: '1px solid #EDF2F7' }}>
          <TextField 
            placeholder="Поиск по артикулу или названию" 
            size="small"
            sx={{ width: 350 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
          />
          <Select 
            value="" 
            displayEmpty 
            size="small" 
            sx={{ width: 200, color: '#718096' }}
          >
            <MenuItem value="">Все теги</MenuItem>
          </Select>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" sx={{ color: '#1A202C', borderColor: '#E2E8F0', padding: '6px 24px' }} onClick={handleSearch}>
            ПОИСК
          </Button>
          {isManager && (
            <Button variant="contained" color="primary" onClick={() => setOpenModal(true)}>
              ПРИХОД ТОВАРА +
            </Button>
          )}
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Артикул</TableCell>
                <TableCell>Наименование</TableCell>
                <TableCell align="right">Остаток (шт)</TableCell>
                <TableCell>Срок годности</TableCell>
                <TableCell>Тег</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stockItems.map((item) => (
                <TableRow key={item.id} hover sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ color: '#4A5568', fontWeight: 500 }}>{item.product_sku || '—'}</TableCell>
                  <TableCell sx={{ color: '#1A202C' }}>{item.product_name || `Товар #${item.product_card}`}</TableCell>
                  <TableCell align="right" sx={{ 
                    color: item.stock_quantity === 0 ? '#E53E3E' : (item.stock_quantity < 5 ? '#DD6B20' : '#38A169'), 
                    fontWeight: 600 
                  }}>
                    {isManager ? (
                      <TextField
                        size="small"
                        type="number"
                        value={qtyDrafts[item.id] ?? item.stock_quantity}
                        onChange={(e) => handleQtyChange(item.id, e.target.value)}
                        onBlur={() => handleQtySave(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.target.blur();
                          }
                        }}
                        disabled={savingQtyIds.has(item.id)}
                        inputProps={{ min: 0, style: { textAlign: 'right', width: 72 } }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      item.stock_quantity
                    )}
                  </TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{item.expiry_date || '—'}</TableCell>
                  <TableCell>
                    {item.stock_tag ? (
                      <Chip 
                        label={item.stock_tag} 
                        sx={{ 
                          ...getTagChipSx(item.stock_tag),
                          fontWeight: 500,
                          height: 24,
                          fontSize: '0.75rem'
                        }} 
                      />
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {stockItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: '#718096' }}>Нет товаров на складе</TableCell>
                </TableRow>
              )}
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

      {isManager && (
        <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Приход товара</DialogTitle>
          <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {formError && (
              <Alert severity="error" role="alert" aria-live="assertive">
                {formError}
              </Alert>
            )}
            <Autocomplete
              options={productOptions}
              value={selectedProduct}
              onChange={(_e, value) => setSelectedProduct(value)}
              onInputChange={handleProductInputChange}
              loading={productSearchLoading}
              getOptionLabel={(option) => option ? `${option.sku || '—'} — ${option.name || ''}` : ''}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              filterOptions={(x) => x}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Товар"
                  placeholder="Поиск по артикулу или названию"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {productSearchLoading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            <TextField
              fullWidth
              label="Количество"
              type="number"
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              inputProps={{ min: 0 }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenModal(false)} color="inherit">Отмена</Button>
            <Button onClick={handleCreateStock} variant="contained" disabled={loading || !selectedProduct}>
              {loading ? <CircularProgress size={24} /> : 'Добавить'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default Warehouse;
