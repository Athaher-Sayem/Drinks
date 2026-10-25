import { useState } from 'react';

export function ProductArt({ slug, name, image }: { slug: string; name: string; image?: string }) {
  const [failed, setFailed] = useState(false);
  if (image && /^https?:\/\//i.test(image) && !failed) return <img className="product-photo" src={image} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  const kind = slug === 'canvas-tote' ? 'tote' : slug === 'stoneware-mug' ? 'mug' : slug === 'citrus-soda' ? 'soda' : 'generic';
  return <div className={`product-art art-${kind}`} role="img" aria-label={`${name} — illustrative artwork`}>
    <svg viewBox="0 0 340 270" fill="none" aria-hidden="true">
      <ellipse cx="173" cy="237" rx="83" ry="9" fill="currentColor" opacity=".06" />
      {kind === 'tote' ? <g transform="rotate(-8 170 145)">
        <path d="M117 98c-5-77 104-77 100 0" stroke="#a39379" strokeWidth="13" />
        <path d="M130 99c-4-61 76-61 75 0" stroke="#d8cbb5" strokeWidth="7" />
        <path d="m93 91 151 2 12 139c-42 11-112 11-170-1l7-140Z" fill="#e8ddc6" stroke="#c8bba2" strokeWidth="1.5" />
        <path d="M102 99h132M101 105l-6 120M237 106l9 120M110 228h119" stroke="#b8a98b" strokeDasharray="3 3" opacity=".65" />
        <path d="M117 91v27m100-25v26" stroke="#b5a486" strokeWidth="5" />
        <rect x="137" y="146" width="65" height="51" rx="2" fill="#f7f1e5" />
        <path d="m170 155 3.7 9.2 9.3 3.8-9.3 3.7-3.7 9.3-3.8-9.3-9.2-3.7 9.2-3.8 3.8-9.2Z" fill="#5145cd" />
        <path d="M152 187h36" stroke="#5145cd" strokeWidth="2" />
      </g> : kind === 'mug' ? <g transform="rotate(7 170 150)">
        <path d="M219 109h18c49 0 43 78-5 78h-19" stroke="#b7afc6" strokeWidth="23" />
        <path d="M220 110h17c44 0 39 70-4 70h-16" stroke="#e1dce7" strokeWidth="13" />
        <path d="M98 104h125v90c0 28-125 28-125 0v-90Z" fill="#d1cadb" stroke="#b7afc6" strokeWidth="1.5" />
        <ellipse cx="160.5" cy="104" rx="62.5" ry="17" fill="#e7e2ec" stroke="#b7afc6" strokeWidth="1.5" />
        <ellipse cx="160.5" cy="105" rx="51" ry="10" fill="#b1a1a0" />
        <path d="M112 126v61c0 10 16 17 26 17" stroke="#e9e4ef" strokeWidth="7" strokeLinecap="round" />
        <path d="m152 153 6 10 11-4-3 12 10 7-13 2-3 12-7-10-12 3 5-12-8-8 13-1 1-11Z" fill="#9b8bb0" />
      </g> : kind === 'soda' ? <g transform="rotate(-10 170 150)">
        <rect x="122" y="48" width="96" height="184" rx="22" fill="#e7b587" stroke="#c79870" strokeWidth="1.5" />
        <path d="M123 84h94v112h-94V84Z" fill="#f9e9ce" />
        <ellipse cx="170" cy="51" rx="45" ry="10" fill="#e8e6df" stroke="#b9b7b0" strokeWidth="1.5" />
        <ellipse cx="170" cy="51" rx="14" ry="4" fill="#aaa9a1" />
        <circle cx="170" cy="143" r="27" fill="#e8ad64" />
        <path d="m170 119 0 48m-24-24h48m-41-17 34 34m-34 0 34-34" stroke="#fff0d6" strokeWidth="2" />
        <path d="M150 97h40M155 105h30M151 184h38" stroke="#98744f" strokeWidth="3" strokeLinecap="round" />
        <path d="M130 64v153" stroke="#fff" strokeOpacity=".25" strokeWidth="5" strokeLinecap="round" />
      </g> : <g>
        <path d="m83 107 84-45 86 45v101l-85 35-85-35V107Z" fill="#dcd7ec" stroke="#b7afcf" strokeWidth="1.5" />
        <path d="m83 107 85 38 85-38M168 145v98M124 84l87 41v48l-20 8v-48l-86-39" stroke="#b7afcf" strokeWidth="2" />
        <path d="m125 161 7 14 15 3-11 10 2 16-13-8-14 8 3-16-12-10 16-3 7-14Z" fill="#f4f1fb" />
      </g>}
    </svg>
  </div>;
}
