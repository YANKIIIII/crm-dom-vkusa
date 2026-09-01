import { Box, Tooltip } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

const TruncatedText = ({ children, sx }) => {
  const ref = useRef(null);
  const [overflowed, setOverflowed] = useState(false);
  const text = children == null || children === '' ? '' : String(children);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setOverflowed(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <Tooltip title={overflowed ? text : ''} disableHoverListener={!overflowed}>
      <Box
        ref={ref}
        component="span"
        sx={{
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          ...sx,
        }}
      >
        {text || '—'}
      </Box>
    </Tooltip>
  );
};

export default TruncatedText;
