import { Box, Tooltip, Typography } from '@mui/material';
import { formatCurrency, GRILL_TYPE_LABELS } from '../utils';

const previewFromProduct = (product) => {
  if (!product) return null;
  return {
    name: product.name || product.product_name,
    sku: product.sku || product.product_sku,
    category: product.category_name || product.product_category_name,
    grillType: product.grill_type || product.product_grill_type,
    grillTypeName: product.grill_type_name || product.product_grill_type_name,
    dimensions: product.dimensions || product.product_dimensions,
    weight: product.weight || product.product_weight,
    rrp: product.rrp || product.product_rrp,
    supplier: product.supplier_name || product.product_supplier_name,
  };
};

const ProductPreviewTooltip = ({ product, children }) => {
  const info = previewFromProduct(product);
  if (!info) return children;

  const rows = [
    info.sku && ['Артикул', info.sku],
    info.category && ['Категория', info.category],
    info.grillType && ['Тип гриля', info.grillTypeName || GRILL_TYPE_LABELS[info.grillType] || info.grillType],
    info.dimensions && ['Габариты', info.dimensions],
    info.weight != null && info.weight !== '' && ['Вес', `${info.weight} кг`],
    info.rrp && ['РРЦ', formatCurrency(info.rrp)],
    info.supplier && ['Поставщик', info.supplier],
  ].filter(Boolean);

  const title = (
    <Box sx={{ px: 0.25, py: 0.25, minWidth: 160, maxWidth: 300 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
        {info.name || 'Товар'}
      </Typography>
      {rows.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 1.5, rowGap: 0.25, mt: 1 }}>
          {rows.map(([label, value]) => (
            <Box display="contents" key={label}>
              <Typography variant="caption" sx={{ opacity: 0.7, lineHeight: 1.45 }}>
                {label}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 500, lineHeight: 1.45 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );

  return (
    <Tooltip
      title={title}
      placement="right"
      enterDelay={250}
      enterNextDelay={150}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: '#1A202C',
            color: '#F7FAFC',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            borderRadius: 2,
            px: 1.5,
            py: 1.25,
          },
        },
      }}
    >
      <Box component="span" sx={{ cursor: 'help', display: 'inline-block', maxWidth: '100%' }}>
        {children}
      </Box>
    </Tooltip>
  );
};

export default ProductPreviewTooltip;
