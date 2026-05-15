import React, { useEffect, useState } from 'react';
import { storeDirectThumbUrl, storeImageFallbackUrl } from '../services/productsApi';

interface Props {
  image?: string;
  alt?: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  width?: number;
  height?: number;
}

export function ProductThumb({
  image,
  alt = '',
  className = '',
  loading = 'lazy',
  fetchPriority = 'low',
  width,
  height,
}: Props) {
  const fallbackSrc = storeImageFallbackUrl(image, 'thumb');
  const [src, setSrc] = useState(() => storeDirectThumbUrl(image));

  useEffect(() => {
    setSrc(storeDirectThumbUrl(image));
  }, [image]);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      width={width}
      height={height}
      onError={() => {
        if (src !== fallbackSrc) setSrc(fallbackSrc);
      }}
    />
  );
}
