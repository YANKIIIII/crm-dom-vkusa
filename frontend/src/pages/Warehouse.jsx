import { Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, TablePagination, IconButton, Tooltip } from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';
import { useFeedback } from '../hooks/useFeedback';
import { extractApiError, formatCurrency, PAGE_SIZE, PAGE_SIZE_OPTIONS, toggleOrdering, buildListQuery, toRangeQuery } from '../utils';
import SortableHeader from '../components/SortableHeader';
import SearchableSelect from '../components/SearchableSelect';
import TruncatedText from '../components/TruncatedText';
import ProductPreviewTooltip from '../components/ProductPreviewTooltip';
import ProductCardDialog from '../components/ProductCardDialog';
import CompareFilter from '../components/CompareFilter';

const EMPTY_PRODUCT_FORM = {
  name: '',
  sku: '',
  category: '',
  supplier: '',
  grill_type: '',
  rrp: '',
  base_cost_price: '',
  min_stock: 0,
  stock_quantity: 0,
  expiry_date: '',
};

const productFormFromCard = (product, stockItem) => ({
  name: product.name || '',
  sku: product.sku || '',
  category: product.category || '',
  supplier: product.supplier || '',
  grill_type: product.grill_type || '',
  rrp: product.rrp ?? '',
  base_cost_price: product.base_cost_price ?? '',
  min_stock: product.min_stock ?? 0,
  stock_quantity: stockItem?.stock_quantity ?? 0,
  expiry_date: stockItem?.expiry_date || '',
});

const buildProductPayload = (formData, categories) => {
  const name = formData.name.trim();
  const sku = formData.sku.trim();
  const category = formData.category === '' ? null : Number(formData.category);
  const supplier = formData.supplier === '' ? null : Number(formData.supplier);
  const baseCost = formData.base_cost_price === '' ? null : Number(formData.base_cost_price);
  const rrp = formData.rrp === '' ? null : Number(formData.rrp);
  const minStock = formData.min_stock === '' ? 0 : Number(formData.min_stock);
  const stockQuantity = formData.stock_quantity === '' ? 0 : Number(formData.stock_quantity);
  const selectedCat = categories.find((c) => String(c.id) === String(category));
  const needsExpiry = selectedCat?.code === 'C' || selectedCat?.code === 'D';

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
  if (Number.isNaN(minStock) || minStock < 0) {
    return { error: 'Мин. количество должно быть числом ≥ 0' };
  }
  if (Number.isNaN(stockQuantity) || stockQuantity < 0) {
    return { error: 'Остаток должен быть числом ≥ 0' };
  }
  if (needsExpiry && !formData.expiry_date) {
    return { error: 'Укажите срок годности' };
  }
  if (selectedCat?.code === 'A' && !formData.grill_type) {
    return { error: 'Укажите тип гриля' };
  }

  return {
    card: {
      name,
      sku,
      category,
      supplier,
      grill_type: formData.grill_type || null,
      base_cost_price: baseCost,
      rrp,
      min_stock: minStock,
    },
    stock: {
      stock_quantity: stockQuantity,
      expiry_date: formData.expiry_date || null,
    },
  };
};

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
  const { notify, confirm } = useFeedback();
  const canWrite = Boolean(localStorage.getItem('user_role'));
  const [stockItems, setStockItems] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [ordering, setOrdering] = useState('id');
  const [category, setCategory] = useState('');
  const [stockTag, setStockTag] = useState('');
  const [expiryOp, setExpiryOp] = useState('');
  const [expiryFrom, setExpiryFrom] = useState('');
  const [expiryTo, setExpiryTo] = useState('');
  const [stockOp, setStockOp] = useState('');
  const [stockFrom, setStockFrom] = useState('');
  const [stockTo, setStockTo] = useState('');
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [productModalMode, setProductModalMode] = useState(null);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM);
  const [editingStock, setEditingStock] = useState(null);
  const [productSaving, setProductSaving] = useState(false);
  const [productFormError, setProductFormError] = useState(null);
  const [qtyDrafts, setQtyDrafts] = useState({});
  const [savingQtyIds, setSavingQtyIds] = useState(() => new Set());
  const [listVersion, setListVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStock = async () => {
      setLoading(true);
      try {
        const expiryRange = toRangeQuery(expiryOp, expiryFrom, expiryTo);
        const stockRange = toRangeQuery(stockOp, stockFrom, stockTo);
        const response = await api.get(
          `/warehouse/stock_items/?${buildListQuery({
            page: page + 1,
            pageSize,
            search,
            ordering,
            extra: {
              category,
              stock_tag: stockTag,
              expiry_after: expiryRange.min,
              expiry_before: expiryRange.max,
              stock_min: stockRange.min,
              stock_max: stockRange.max,
            },
          })}`
        );
        if (cancelled) return;
        setStockItems(response.data.results || response.data);
        setTotalCount(response.data.count || 0);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(extractApiError(err));
          notify(`Не удалось загрузить склад:\n${extractApiError(err)}`, 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchStock();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, search, ordering, category, stockTag, expiryOp, expiryFrom, expiryTo, stockOp, stockFrom, stockTo, listVersion, notify]);

  const reloadSuppliers = async () => {
    try {
      const res = await api.get('/catalog/suppliers/', { params: { page_size: 100 } });
      setSuppliers(res.data.results || res.data || []);
    } catch {
      setSuppliers([]);
    }
  };

  useEffect(() => {
    api.get('/catalog/product_categories/')
      .then((res) => setCategories(res.data.results || res.data || []))
      .catch(() => setCategories([]));
    reloadSuppliers();
  }, []);

  const handleSearch = () => {
    setPage(0);
    setSearch(searchInput);
    setListVersion((v) => v + 1);
  };

  const closeProductModal = () => {
    if (productSaving) return;
    setProductModalMode(null);
    setEditingStock(null);
    setProductFormError(null);
  };

  const openCreateProduct = () => {
    setProductForm(EMPTY_PRODUCT_FORM);
    setEditingStock(null);
    setProductFormError(null);
    setProductModalMode('create');
  };

  const openEditProduct = async (item) => {
    if (!canWrite || !item?.product_card) return;
    setProductFormError(null);
    try {
      const res = await api.get(`/catalog/product_cards/${item.product_card}/`);
      setProductForm(productFormFromCard(res.data, item));
      setEditingStock(item);
      setProductModalMode('edit');
    } catch (err) {
      notify(`Не удалось открыть карточку товара:\n${extractApiError(err)}`, 'error');
    }
  };

  const handleSaveProduct = async () => {
    const built = buildProductPayload(productForm, categories);
    if (built.error) {
      setProductFormError(built.error);
      return;
    }
    setProductSaving(true);
    setProductFormError(null);
    try {
      if (productModalMode === 'edit' && editingStock) {
        await api.patch(`/catalog/product_cards/${editingStock.product_card}/`, built.card);
        await api.patch(`/warehouse/stock_items/${editingStock.id}/`, built.stock);
      } else {
        const created = await api.post('/catalog/product_cards/', built.card);
        await api.post('/warehouse/stock_items/', {
          product_card: created.data.id,
          ...built.stock,
        });
      }
      setProductModalMode(null);
      setEditingStock(null);
      setListVersion((v) => v + 1);
    } catch (error) {
      setProductFormError(
        productModalMode === 'edit'
          ? `Не удалось сохранить товар: ${extractApiError(error)}`
          : `Не удалось создать товар: ${extractApiError(error)}`
      );
    } finally {
      setProductSaving(false);
    }
  };

  const handleDeleteStock = async (e, item) => {
    e.stopPropagation();
    if (!canWrite) return;
    const label = item.product_name || item.product_sku || `#${item.id}`;
    if (!(await confirm(`Удалить позицию склада «${label}»? Карточка товара останется.`))) {
      return;
    }
    try {
      await api.delete(`/warehouse/stock_items/${item.id}/`);
      setListVersion((v) => v + 1);
    } catch (error) {
      notify(`Не удалось удалить позицию:\n${extractApiError(error)}`, 'error');
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
      setListVersion((v) => v + 1);
    } catch (error) {
      notify(`Не удалось обновить остаток:\n${extractApiError(error)}`, 'error');
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
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
            borderBottom: '1px solid #EDF2F7',
          }}
        >
          <TextField
            placeholder="Поиск…"
            size="small"
            sx={{ width: 148, flex: '0 0 148px' }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            slotProps={{ input: { 'aria-label': 'Поиск товаров' } }}
          />
          <Box sx={{ width: 124, flex: '0 0 124px' }}>
            <SearchableSelect
              id="warehouse-category"
              label="Категория"
              value={category}
              onChange={(value) => { setCategory(value); setPage(0); }}
              options={[
                { value: '', label: 'Все' },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </Box>
          <Box sx={{ width: 128, flex: '0 1 168px', minWidth: 128 }}>
            <SearchableSelect
              id="warehouse-tag"
              label="Тег"
              value={stockTag}
              onChange={(value) => { setStockTag(value); setPage(0); }}
              options={[
                { value: '', label: 'Все' },
                { value: 'Товар заканчивается', label: 'Товар заканчивается' },
                { value: 'Нет в наличии', label: 'Нет в наличии' },
              ]}
            />
          </Box>
          <CompareFilter
            id="warehouse-expiry"
            label="Срок годности"
            op={expiryOp}
            onOpChange={(next) => {
              setExpiryOp(next);
              if (!next) {
                setExpiryFrom('');
                setExpiryTo('');
              } else if (next !== 'between') {
                setExpiryTo('');
              }
              setPage(0);
            }}
            value={expiryFrom}
            onValueChange={(next) => { setExpiryFrom(next); setPage(0); }}
            valueTo={expiryTo}
            onValueToChange={(next) => { setExpiryTo(next); setPage(0); }}
            type="date"
          />
          <CompareFilter
            id="warehouse-stock"
            label="Остаток"
            op={stockOp}
            onOpChange={(next) => {
              setStockOp(next);
              if (!next) {
                setStockFrom('');
                setStockTo('');
              } else if (next !== 'between') {
                setStockTo('');
              }
              setPage(0);
            }}
            value={stockFrom}
            onValueChange={(next) => { setStockFrom(next); setPage(0); }}
            valueTo={stockTo}
            onValueToChange={(next) => { setStockTo(next); setPage(0); }}
            type="number"
          />
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto', flexShrink: 0 }}>
            <Button
              variant="outlined"
              sx={{ color: '#1A202C', borderColor: '#E2E8F0', px: 2 }}
              onClick={handleSearch}
            >
              ПОИСК
            </Button>
            {canWrite && (
              <Button variant="contained" color="primary" onClick={openCreateProduct}>
                НОВЫЙ ТОВАР +
              </Button>
            )}
          </Box>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <SortableHeader field="product_card__sku" label="Артикул" ordering={ordering} onSort={(field) => { setOrdering(toggleOrdering(ordering, field)); setPage(0); }} />
                <SortableHeader field="product_card__name" label="Наименование" ordering={ordering} onSort={(field) => { setOrdering(toggleOrdering(ordering, field)); setPage(0); }} />
                <SortableHeader field="product_card__category__name" label="Категория" ordering={ordering} onSort={(field) => { setOrdering(toggleOrdering(ordering, field)); setPage(0); }} />
                <SortableHeader field="stock_quantity" label="Остаток" ordering={ordering} onSort={(field) => { setOrdering(toggleOrdering(ordering, field)); setPage(0); }} align="right" />
                <SortableHeader field="product_card__min_stock" label="Мин. количество" ordering={ordering} onSort={(field) => { setOrdering(toggleOrdering(ordering, field)); setPage(0); }} align="right" />
                <SortableHeader field="product_card__rrp" label="РРЦ" ordering={ordering} onSort={(field) => { setOrdering(toggleOrdering(ordering, field)); setPage(0); }} align="right" />
                <SortableHeader field="stock_tag" label="Тег" ordering={ordering} onSort={(field) => { setOrdering(toggleOrdering(ordering, field)); setPage(0); }} />
                <SortableHeader field="expiry_date" label="Срок годности" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} defaultDesc />
                {canWrite && <TableCell align="right">Действия</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canWrite ? 9 : 8} align="center" sx={{ py: 4, color: '#718096' }}>
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={canWrite ? 9 : 8} align="center" sx={{ py: 4, color: '#E53E3E' }}>
                    Не удалось загрузить склад
                  </TableCell>
                </TableRow>
              ) : stockItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canWrite ? 9 : 8} align="center" sx={{ py: 4, color: '#718096' }}>Нет товаров на складе</TableCell>
                </TableRow>
              ) : stockItems.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  onDoubleClick={() => openEditProduct(item)}
                  title={canWrite ? 'Двойной клик — карточка товара' : undefined}
                  sx={{
                    cursor: canWrite ? 'pointer' : 'default',
                    bgcolor: item.stock_tag === 'Нет в наличии'
                      ? '#FED7D7'
                      : item.stock_tag === 'Товар заканчивается'
                        ? '#FEFCBF'
                        : undefined,
                  }}
                >
                  <TableCell sx={{ color: '#4A5568', fontWeight: 500, maxWidth: 140 }}><TruncatedText>{item.product_sku || '—'}</TruncatedText></TableCell>
                  <TableCell sx={{ color: '#1A202C', maxWidth: 240 }}>
                    <ProductPreviewTooltip product={{
                      name: item.product_name,
                      sku: item.product_sku,
                      category_name: item.category_name,
                      rrp: item.rrp,
                    }}>
                      <TruncatedText>{item.product_name || `Товар #${item.product_card}`}</TruncatedText>
                    </ProductPreviewTooltip>
                  </TableCell>
                  <TableCell sx={{ color: '#4A5568', maxWidth: 160 }}><TruncatedText>{item.category_name || '—'}</TruncatedText></TableCell>
                  <TableCell align="right" sx={{ 
                    color: item.stock_quantity === 0 ? '#E53E3E' : (item.stock_quantity < 5 ? '#DD6B20' : '#38A169'), 
                    fontWeight: 600 
                  }}>
                    {canWrite ? (
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
                        slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right', width: 72 } } }}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      item.stock_quantity
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#4A5568' }}>{item.min_stock ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ color: '#4A5568', fontWeight: 600 }}>
                    {item.rrp != null && item.rrp !== '' ? formatCurrency(item.rrp) : '—'}
                  </TableCell>
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
                  <TableCell sx={{ color: '#4A5568' }}>{item.expiry_date || '—'}</TableCell>
                  {canWrite && (
                    <TableCell align="right" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Удалить позицию склада">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`Удалить ${item.product_name || item.product_sku || item.id}`}
                            onClick={(e) => handleDeleteStock(e, item)}
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
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
        />
      </Paper>

      {canWrite && (
        <ProductCardDialog
          open={Boolean(productModalMode)}
          mode={productModalMode || 'create'}
          formData={productForm}
          setFormData={setProductForm}
          categories={categories}
          suppliers={suppliers}
          error={productFormError}
          loading={productSaving}
          onClose={closeProductModal}
          onSubmit={handleSaveProduct}
          onSuppliersChange={reloadSuppliers}
        />
      )}
    </Box>
  );
};

export default Warehouse;
