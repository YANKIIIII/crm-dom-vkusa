import { Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Select, MenuItem, TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, FormControl, InputLabel } from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';
import { extractApiError, PAGE_SIZE } from '../utils';

const Catalog = () => {
  const isManager = localStorage.getItem('user_role') === 'manager';
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', sku: '', category: '', supplier: '', grill_type: 'charcoal', rrp: '', base_cost_price: '' });
  
  const fetchProducts = async () => {
    try {
      const response = await api.get(`/catalog/product_cards/?page=${page + 1}&search=${search}`);
      setProducts(response.data.results || response.data);
      setTotalCount(response.data.count || 0);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [page]);

  useEffect(() => {
    api.get('/catalog/product_categories/')
      .then(r => setCategories(r.data.results || r.data))
      .catch(err => console.error("Failed to load categories", err));
    api.get('/catalog/suppliers/')
      .then(r => setSuppliers(r.data.results || r.data))
      .catch(err => console.error("Failed to load suppliers", err));
  }, []);

  const handleSearch = () => {
    if (page !== 0) {
      setPage(0);
    } else {
      fetchProducts();
    }
  };

  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleCreateProduct = async () => {
    setLoading(true);
    try {
      await api.post('/catalog/product_cards/', formData);
      setOpenModal(false);
      fetchProducts();
    } catch (error) {
      console.error("Failed to add product", error);
      alert(`Не удалось создать товар:\n${extractApiError(error)}`);
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
            <MenuItem value="">Все категории</MenuItem>
          </Select>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" sx={{ color: '#1A202C', borderColor: '#E2E8F0', padding: '6px 24px' }} onClick={handleSearch}>
            ПОИСК
          </Button>
          {isManager && (
            <Button variant="contained" color="primary" onClick={() => setOpenModal(true)}>
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
                <TableRow key={row.id} hover sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ color: '#4A5568', fontWeight: 500 }}>{row.sku}</TableCell>
                  <TableCell sx={{ color: '#1A202C' }}>{row.name}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.category_name || '—'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.supplier_name || '—'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>
                    {row.grill_type ? (
                      <Box sx={{ bgcolor: '#EDF2F7', px: 1.5, py: 0.5, borderRadius: 4, display: 'inline-block', fontSize: '0.85rem' }}>
                        {row.grill_type === 'charcoal' ? 'Угольный' : row.grill_type === 'gas' ? 'Газовый' : row.grill_type === 'ceramic' ? 'Керамический' : row.grill_type}
                      </Box>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#4A5568', fontWeight: 600 }}>{row.rrp ? `${row.rrp} BYN` : '—'}</TableCell>
                  <TableCell align="right" sx={{ color: '#4A5568' }}>{row.base_cost_price} BYN</TableCell>
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#718096' }}>Нет товаров</TableCell>
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
          <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth label="Наименование" name="name" value={formData.name} onChange={handleInputChange} />
            <TextField fullWidth label="Артикул" name="sku" value={formData.sku} onChange={handleInputChange} />
            <FormControl fullWidth>
              <InputLabel>Категория</InputLabel>
              <Select name="category" value={formData.category} label="Категория" onChange={handleInputChange} displayEmpty>
                <MenuItem value="" disabled>Категория</MenuItem>
                {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Поставщик</InputLabel>
              <Select name="supplier" value={formData.supplier} label="Поставщик" onChange={handleInputChange} displayEmpty>
                <MenuItem value="" disabled>Поставщик</MenuItem>
                {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Тип гриля</InputLabel>
              <Select name="grill_type" value={formData.grill_type} label="Тип гриля" onChange={handleInputChange}>
                <MenuItem value="charcoal">Угольный</MenuItem>
                <MenuItem value="gas">Газовый</MenuItem>
                <MenuItem value="ceramic">Керамический</MenuItem>
              </Select>
            </FormControl>
            <TextField fullWidth label="РРЦ (BYN)" name="rrp" type="number" value={formData.rrp} onChange={handleInputChange} />
            <TextField fullWidth label="Базовая себестоимость (BYN)" name="base_cost_price" type="number" value={formData.base_cost_price} onChange={handleInputChange} />
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
