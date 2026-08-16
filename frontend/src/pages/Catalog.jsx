import {
  Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Select, MenuItem, TablePagination,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
  FormControl, InputLabel, Alert,
} from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';
import { extractApiError, PAGE_SIZE } from '../utils';

const EMPTY_FORM = {
  name: '',
  sku: '',
  category: '',
  supplier: '',
  grill_type: 'charcoal',
  rrp: '',
  base_cost_price: '',
};

const Catalog = () => {
  const isManager = localStorage.getItem('user_role') === 'manager';
  const [products, setProducts] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchProducts = async () => {
      try {
        const response = await api.get(
          `/catalog/product_cards/?page=${page + 1}&search=${encodeURIComponent(search)}`
        );
        if (cancelled) return;
        setProducts(response.data.results || response.data);
        setTotalCount(response.data.count || 0);
      } catch (err) {
        if (!cancelled) console.error(err);
      }
    };
    fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [page, search, listVersion]);

  useEffect(() => {
    api.get('/catalog/product_categories/')
      .then((r) => setCategories(r.data.results || r.data))
      .catch((err) => console.error('Failed to load categories', err));
    api.get('/catalog/suppliers/')
      .then((r) => setSuppliers(r.data.results || r.data))
      .catch((err) => console.error('Failed to load suppliers', err));
  }, []);

  const handleSearch = () => {
    setPage(0);
    setSearch(searchInput);
    setListVersion((v) => v + 1);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const openCreateModal = () => {
    setFormData(EMPTY_FORM);
    setFormError(null);
    setOpenModal(true);
  };

  const buildPayload = () => {
    const name = formData.name.trim();
    const sku = formData.sku.trim();
    const category = formData.category === '' ? null : Number(formData.category);
    const supplier = formData.supplier === '' ? null : Number(formData.supplier);
    const baseCost = formData.base_cost_price === '' ? null : Number(formData.base_cost_price);
    const rrp = formData.rrp === '' ? null : Number(formData.rrp);

    if (!name) return { error: 'Укажите наименование' };
    if (!sku) return { error: 'Укажите артикул' };
    if (!category) return { error: 'Выберите категорию' };
    if (!supplier) return { error: 'Выберите поставщика' };
    if (baseCost === null || Number.isNaN(baseCost) || baseCost < 0) {
      return { error: 'Укажите базовую себестоимость (число ≥ 0)' };
    }
    if (rrp !== null && (Number.isNaN(rrp) || rrp < 0)) {
      return { error: 'РРЦ должна быть числом ≥ 0' };
    }

    return {
      payload: {
        name,
        sku,
        category,
        supplier,
        grill_type: formData.grill_type || null,
        base_cost_price: baseCost,
        rrp,
      },
    };
  };

  const handleCreateProduct = async () => {
    const built = buildPayload();
    if (built.error) {
      setFormError(built.error);
      return;
    }

    setLoading(true);
    setFormError(null);
    try {
      await api.post('/catalog/product_cards/', built.payload);
      setOpenModal(false);
      setFormData(EMPTY_FORM);
      setListVersion((v) => v + 1);
    } catch (error) {
      console.error('Failed to add product', error);
      setFormError(`Не удалось создать товар: ${extractApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Каталог товаров</Typography>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ p: 3, display: 'flex', gap: 2, alignItems: 'center', borderBottom: '1px solid #EDF2F7' }}>
          <TextField
            placeholder="Поиск…"
            size="small"
            sx={{ width: 350 }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            slotProps={{ input: { 'aria-label': 'Поиск товаров' } }}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Button
            variant="outlined"
            sx={{ color: '#1A202C', borderColor: '#E2E8F0', padding: '6px 24px' }}
            onClick={handleSearch}
          >
            ПОИСК
          </Button>
          {isManager && (
            <Button variant="contained" color="primary" onClick={openCreateModal}>
              НОВЫЙ ТОВАР +
            </Button>
          )}
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Артикул</TableCell>
                <TableCell>Наименование</TableCell>
                <TableCell>Категория</TableCell>
                <TableCell>Поставщик</TableCell>
                <TableCell>Тип гриля</TableCell>
                <TableCell align="right">РРЦ</TableCell>
                <TableCell align="right">Базовая себестоимость</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ color: '#4A5568', fontWeight: 500 }}>{row.sku}</TableCell>
                  <TableCell sx={{ color: '#1A202C' }}>{row.name}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.category_name || '—'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.supplier_name || '—'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>
                    {row.grill_type ? (
                      <Box
                        sx={{
                          bgcolor: '#EDF2F7',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 4,
                          display: 'inline-block',
                          fontSize: '0.85rem',
                        }}
                      >
                        {row.grill_type === 'charcoal'
                          ? 'Угольный'
                          : row.grill_type === 'gas'
                            ? 'Газовый'
                            : row.grill_type === 'ceramic'
                              ? 'Керамический'
                              : row.grill_type}
                      </Box>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#4A5568', fontWeight: 600 }}>
                    {row.rrp ? `${row.rrp} BYN` : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#4A5568' }}>
                    {row.base_cost_price} BYN
                  </TableCell>
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#718096' }}>
                    Нет товаров
                  </TableCell>
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
          <DialogTitle>Новый товар</DialogTitle>
          <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            {formError && (
              <Alert severity="error" role="alert" aria-live="assertive">
                {formError}
              </Alert>
            )}
            <TextField
              fullWidth
              required
              label="Наименование"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
            />
            <TextField
              fullWidth
              required
              label="Артикул"
              name="sku"
              value={formData.sku}
              onChange={handleInputChange}
            />
              <FormControl fullWidth required>
                <InputLabel id="catalog-category-label" shrink>Категория</InputLabel>
                <Select
                  labelId="catalog-category-label"
                  id="catalog-category"
                  name="category"
                  displayEmpty
                  notched
                  value={formData.category}
                  label="Категория"
                  onChange={handleInputChange}
                >
                  <MenuItem value="" disabled>Выберите категорию</MenuItem>
                {categories.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
              <FormControl fullWidth required>
                <InputLabel id="catalog-supplier-label" shrink>Поставщик</InputLabel>
                <Select
                  labelId="catalog-supplier-label"
                  id="catalog-supplier"
                  name="supplier"
                  displayEmpty
                  notched
                  value={formData.supplier}
                  label="Поставщик"
                  onChange={handleInputChange}
                >
                  <MenuItem value="" disabled>Выберите поставщика</MenuItem>
                {suppliers.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="catalog-grill-label">Тип гриля</InputLabel>
              <Select
                labelId="catalog-grill-label"
                id="catalog-grill"
                name="grill_type"
                value={formData.grill_type}
                label="Тип гриля"
                onChange={handleInputChange}
              >
                <MenuItem value="charcoal">Угольный</MenuItem>
                <MenuItem value="gas">Газовый</MenuItem>
                <MenuItem value="ceramic">Керамический</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="РРЦ (BYN)"
              name="rrp"
              type="number"
              value={formData.rrp}
              onChange={handleInputChange}
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
            />
            <TextField
              fullWidth
              required
              label="Базовая себестоимость (BYN)"
              name="base_cost_price"
              type="number"
              value={formData.base_cost_price}
              onChange={handleInputChange}
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenModal(false)} color="inherit">Отмена</Button>
            <Button onClick={handleCreateProduct} variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={24} /> : 'Добавить'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default Catalog;
