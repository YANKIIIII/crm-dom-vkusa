import { useEffect, useState } from 'react';
import {
  Alert, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Button,
} from '@mui/material';
import SearchableSelect from './SearchableSelect';
import SupplierPicker from './SupplierPicker';
import { GRILL_TYPE_LABELS, extractApiError } from '../utils';
import api from '../api';

const ProductCardDialog = ({
  open,
  mode,
  formData,
  setFormData,
  categories,
  suppliers,
  error,
  loading,
  onClose,
  onSubmit,
  onSuppliersChange,
}) => {
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState(null);

  useEffect(() => {
    if (!open) return;
    const current = suppliers.find((s) => String(s.id) === String(formData.supplier));
    setSupplierName(current?.name || '');
    setSupplierPhone(current?.phone || '');
    setSupplierError(null);
  }, [open, formData.supplier, suppliers]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectSupplier = (supplierId) => {
    setFormData((prev) => ({ ...prev, supplier: supplierId }));
    const current = suppliers.find((s) => String(s.id) === String(supplierId));
    setSupplierName(current?.name || '');
    setSupplierPhone(current?.phone || '');
    setSupplierError(null);
  };

  const handleAddSupplier = async () => {
    const name = supplierName.trim();
    if (!name) {
      setSupplierError('Укажите название поставщика');
      return;
    }
    setAddingSupplier(true);
    setSupplierError(null);
    try {
      const saved = await api.post('/catalog/suppliers/', {
        name,
        phone: supplierPhone.trim(),
      });
      await onSuppliersChange?.();
      setFormData((prev) => ({ ...prev, supplier: saved.data.id }));
      setSupplierName(saved.data.name || name);
      setSupplierPhone(saved.data.phone || '');
    } catch (err) {
      setSupplierError(extractApiError(err));
    } finally {
      setAddingSupplier(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === 'edit' ? 'Карточка товара' : 'Новый товар'}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2, overflow: 'visible' }}>
        {error && (
          <Alert severity="error" role="alert" aria-live="assertive">
            {error}
          </Alert>
        )}
        {supplierError && (
          <Alert severity="error" role="alert" aria-live="assertive">
            {supplierError}
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
        <SearchableSelect
          id="warehouse-product-category"
          label="Категория"
          required
          placeholder="Выберите категорию"
          value={formData.category}
          onChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <SupplierPicker
          id="warehouse-product-supplier"
          suppliers={suppliers}
          value={formData.supplier}
          onChange={handleSelectSupplier}
          name={supplierName}
          phone={supplierPhone}
          onNameChange={setSupplierName}
          onPhoneChange={setSupplierPhone}
          onAdd={handleAddSupplier}
          adding={addingSupplier}
        />
        <SearchableSelect
          id="warehouse-product-grill"
          label="Тип гриля"
          value={formData.grill_type}
          onChange={(value) => setFormData((prev) => ({ ...prev, grill_type: value }))}
          options={Object.entries(GRILL_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
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
        <TextField
          fullWidth
          label="Мин. количество"
          name="min_stock"
          type="number"
          value={formData.min_stock}
          onChange={handleInputChange}
          slotProps={{ htmlInput: { min: 0 } }}
        />
        <TextField
          fullWidth
          label="Остаток"
          name="stock_quantity"
          type="number"
          value={formData.stock_quantity}
          onChange={handleInputChange}
          slotProps={{ htmlInput: { min: 0 } }}
        />
        <TextField
          fullWidth
          type="date"
          label="Срок годности"
          name="expiry_date"
          value={formData.expiry_date}
          onChange={handleInputChange}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={loading}>Отмена</Button>
        <Button onClick={onSubmit} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={24} /> : (mode === 'edit' ? 'Сохранить' : 'Добавить')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProductCardDialog;
