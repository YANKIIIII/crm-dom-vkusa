import { Box } from '@mui/material';

const BrandMark = ({ height = 48 }) => (
  <Box
    component="img"
    src="/logo.png"
    alt="Дом Вкуса"
    sx={{
      height,
      width: 'auto',
      maxWidth: height * 1.15,
      objectFit: 'contain',
      flexShrink: 0,
      display: 'block',
    }}
  />
);

export default BrandMark;
