<template>
  <div class="currency-illustration" aria-hidden="true">
    <svg viewBox="0 0 440 300" fill="none">
      <defs>
        <clipPath id="globe-clip"><circle cx="223" cy="154" r="108" /></clipPath>
        <pattern id="globe-dots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#a7b9a5" /></pattern>
      </defs>
      <ellipse cx="222" cy="264" rx="120" ry="9" fill="#dfe5d8" opacity=".6" />
      <circle cx="223" cy="154" r="132" stroke="#d8dfd0" stroke-dasharray="3 7" />
      <circle cx="223" cy="154" r="108" fill="#e7eddf" stroke="#a6b99e" />
      <g clip-path="url(#globe-clip)" stroke="#b3c3a9" stroke-width="1">
        <ellipse cx="223" cy="154" rx="73" ry="108" />
        <ellipse cx="223" cy="154" rx="29" ry="108" />
        <ellipse cx="223" cy="154" rx="108" ry="68" />
        <ellipse cx="223" cy="154" rx="108" ry="27" />
        <path d="M115 154h216M223 46v216" />
        <path d="m143 94 23-19 27 6 11 17-13 15-1 23-17 5-10-17-18-9Zm50 49 21 5 12 27-8 15-8 35-12 9-7-30-15-22 4-22Zm46-60 16-19 28 9 13 19 19 9-6 28-29 1-13 17-27-15-9-21Zm37 109 16-11 22 11 4 20-24 8-18-12Z" fill="url(#globe-dots)" stroke="none" />
      </g>
      <path d="M84 200c22 21 81 25 148 9 80-20 137-59 128-87-3-10-14-17-31-20" stroke="#1c543d" stroke-width="1.5" />
      <g transform="translate(83 68) rotate(-12)">
        <rect width="63" height="72" rx="13" fill="#fffef9" stroke="#c8d3bd" />
        <rect x="6" y="6" width="51" height="60" rx="9" stroke="#e0e6d7" />
        <text x="31.5" y="49" fill="#24573c" font-family="Georgia,serif" font-size="38" text-anchor="middle">€</text>
      </g>
      <g transform="translate(306 162) rotate(12)">
        <rect width="63" height="72" rx="13" fill="#d7ebba" stroke="#b2ca93" />
        <rect x="6" y="6" width="51" height="60" rx="9" stroke="#b2ca93" />
        <text x="31.5" y="49" fill="#24573c" font-family="Georgia,serif" font-size="38" text-anchor="middle">¥</text>
      </g>
      <circle cx="305" cy="55" r="20" fill="#184c3b" />
      <text x="305" y="64" fill="#d6f2bc" font-family="Georgia,serif" font-size="26" text-anchor="middle">$</text>
      <path d="M73 181v12m-6-6h12M361 78v12m-6-6h12" stroke="#7b956c" stroke-width="1.5" />
      <circle cx="111" cy="241" r="3" fill="#8fa17c" />
      <circle cx="369" cy="148" r="3" fill="#8fa17c" />
    </svg>
    <span class="illustration-caption">A little knowledge goes a long way.</span>
  </div>
</template>
