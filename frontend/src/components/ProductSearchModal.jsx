import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, Box, Select, MenuItem, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, Typography, Pagination, Tooltip, Paper
} from '@mui/material';
import api from '../api';
import { formatCurrency, PAGE_SIZE } from '../utils';

const ProductSearchModal = ({ open, onClose, onAdd, categories }) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  const [selectedIds, setSelectedIds] = useState([]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      params.append('page', page);
      // price filtering can be added later
      
      const res = await api.get(`/catalog/product_cards/?${params.toString()}`);
      if (res.data.results) {
        setProducts(res.data.results);
        setTotalPages(Math.max(1, Math.ceil(res.data.count / PAGE_SIZE)));
        setTotalCount(res.data.count);
      } else {
        setProducts(res.data);
        setTotalPages(1);
        setTotalCount(res.data.length);
      }
    } catch (err) {
      console.error("Failed to search products", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchProducts();
      setSelectedIds([]);
    }
  }, [open, page]);

  const handleSearchClick = () => {
    setPage(1);
    fetchProducts();
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };
  
  const handleToggleAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(products.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleAdd = () => {
    const selectedProducts = products.filter(p => selectedIds.includes(p.id));
    onAdd(selectedProducts);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1.25rem', pt: 3, pb: 2 }}>
        Поиск товара
      </DialogTitle>
      
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 1 }}>
        {/* Search Inputs */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Примечание"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearchClick()}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <Select
                fullWidth
                size="small"
                displayEmpty
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">Категория</MenuItem>
                {categories.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Цена"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Button 
                variant="contained" 
                fullWidth 
                onClick={handleSearchClick}
                sx={{ 
                  backgroundColor: '#C05621', 
                  '&:hover': { backgroundColor: '#9C4221' },
                  height: '40px',
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                ПОИСК
              </Button>
            </Grid>
          </Grid>
        </Box>

        {/* Results Table */}
        <TableContainer sx={{ borderBottom: '1px solid #EDF2F7', mt: 2 }}>
          <Table size="small" sx={{ '& .MuiTableCell-root': { borderBottom: '1px solid #EDF2F7', py: 1.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ borderBottom: 'none' }}>
                  <Checkbox 
                    size="small"
                    checked={products.length > 0 && selectedIds.length === products.length}
                    indeterminate={selectedIds.length > 0 && selectedIds.length < products.length}
                    onChange={handleToggleAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', borderBottom: 'none' }}>Товар / Артикул</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', borderBottom: 'none' }}>Категория</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', borderBottom: 'none' }}>Тип гриля</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', borderBottom: 'none' }}>Габариты</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', borderBottom: 'none' }}>Вес</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', borderBottom: 'none' }}>Цена без НДС</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', borderBottom: 'none' }}>НДС %</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', borderBottom: 'none' }}>Цена с НДС</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 3, borderBottom: 'none' }}>Загрузка...</TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 3, borderBottom: 'none' }}>Товары не найдены</TableCell>
                </TableRow>
              ) : (
                products.map((product) => {
                  const isSelected = selectedIds.includes(product.id);
                  const priceWithVat = product.rrp ? parseFloat(product.rrp) : parseFloat(product.base_cost_price) * 1.5;
                  const priceWithoutVat = priceWithVat / 1.2;

                  return (
                    <TableRow 
                      key={product.id} 
                      hover 
                      onClick={() => handleToggleSelect(product.id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={isSelected} />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: '#2D3748' }}>{product.name}</Typography>
                          <Typography variant="caption" sx={{ color: '#A0AEC0' }}>{product.sku}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>{product.category_name || '-'}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>
                        {product.grill_type === 'gas' ? 'Газовый' : 
                         product.grill_type === 'charcoal' ? 'Угольный' : 
                         product.grill_type === 'ceramic' ? 'Керамический' : '-'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{product.dimensions || '—'}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{product.weight ? `${product.weight} кг` : '—'}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatCurrency(priceWithoutVat)}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>20%</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatCurrency(priceWithVat)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mt: 1 }}>
           {/* Pagination placeholder as in mockup */}
           <Typography variant="caption" sx={{ mr: 2, color: '#718096' }}>Rows per page: {PAGE_SIZE}</Typography>
           <Typography variant="caption" sx={{ mr: 2, color: '#718096' }}>
             {totalCount === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
           </Typography>
           <Pagination 
             count={totalPages} 
             page={page} 
             onChange={(e, val) => setPage(val)} 
             size="small"
             siblingCount={0}
             boundaryCount={1}
             sx={{ '& .MuiPaginationItem-root': { color: '#718096' } }}
           />
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 3, pt: 1, pr: 4 }}>
        <Button onClick={onClose} sx={{ color: '#718096', textTransform: 'none' }}>Отмена</Button>
        <Button 
          onClick={handleAdd} 
          variant="contained" 
          disabled={selectedIds.length === 0}
          sx={{ 
            backgroundColor: '#C05621', 
            '&:hover': { backgroundColor: '#9C4221' },
            textTransform: 'none',
            borderRadius: 2
          }}
        >
          Добавить выбранные ({selectedIds.length})
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProductSearchModal;
