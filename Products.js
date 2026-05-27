/* ═══════════════════════════════════════════════════
   products.js — All store data
   Edit this file to add/remove products, categories,
   and blog posts. No other file needs changing.
═══════════════════════════════════════════════════ */

const STORE = {

  /* ── CATEGORIES ── */
  categories: [
    { id: 'shoes',       name: 'Shoes',           emoji: '👟', desc: 'Step up your shoe game',              color: '#1E1B4B', gradient: 'linear-gradient(135deg,#1E1B4B,#4C1D95)', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80' },
    { id: 'clothing',    name: 'Clothing',         emoji: '👕', desc: 'Everyday fashion for every mood',     color: '#7C3AED', gradient: 'linear-gradient(135deg,#7C3AED,#EC4899)', image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&q=80' },
    { id: 'accessories', name: 'Accessories',      emoji: '⌚', desc: 'The details that define you',         color: '#9F1239', gradient: 'linear-gradient(135deg,#9F1239,#DB2777)', image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80' },
    { id: 'bags',        name: 'Bags',             emoji: '👜', desc: 'Carry your world in style',           color: '#B45309', gradient: 'linear-gradient(135deg,#B45309,#D97706)', image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80' },
    { id: 'sportswear',  name: 'Sportswear',       emoji: '🏃', desc: 'Perform and look great doing it',     color: '#065F46', gradient: 'linear-gradient(135deg,#065F46,#059669)', image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80' },
    { id: 'electronics', name: 'Electronics',      emoji: '🎧', desc: 'Tech that completes your style',      color: '#0369A1', gradient: 'linear-gradient(135deg,#0369A1,#0EA5E9)', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80' },
    { id: 'food',        name: 'Food & Drinks',    emoji: '🍵', desc: 'Fuel your lifestyle beautifully',     color: '#7C2D12', gradient: 'linear-gradient(135deg,#7C2D12,#EA580C)', image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&q=80' },
    { id: 'health',      name: 'Health & Beauty',  emoji: '✨', desc: 'Look and feel your absolute best',    color: '#86198F', gradient: 'linear-gradient(135deg,#86198F,#C026D3)', image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&q=80' },
    { id: 'other',       name: 'Other',            emoji: '🎁', desc: 'Discover something unexpected',       color: '#374151', gradient: 'linear-gradient(135deg,#374151,#6B7280)', image: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=600&q=80' },
  ],

  /* ── PRODUCTS ── */
  /* Products are loaded live from the Finexy admin panel via Supabase.
     This array starts empty — Admin or Manager must add products
     from the admin panel for them to appear here. */
  products: [],

    /* ── BLOG ── */
  blog: [
    {
      id: 1,
      title: 'How to Build a Capsule Wardrobe in 2026',
      category: 'Style Guide',
      date: 'May 10, 2026',
      readTime: '7 min read',
      excerpt: 'A capsule wardrobe eliminates decision fatigue, saves money, and makes you look better every day. Here is exactly how to build yours.',
      content: `
        <h2>How to Build a Capsule Wardrobe in 2026</h2>
        <p class="blog-meta">📅 May 10, 2026 &nbsp;·&nbsp; ⏱ 7 min read &nbsp;·&nbsp; 🏷 Style Guide</p>
        <p>A capsule wardrobe is a curated collection of timeless, versatile pieces that never go out of style and work seamlessly together. The concept was popularised by Susie Faux in the 1970s and has only grown more relevant in today's fast-fashion world.</p>
        <h3>The 12 Essential Pieces</h3>
        <p>Start with these foundations: a crisp white shirt, a well-fitted navy blazer, a pair of slim chino trousers in khaki, a premium white tee, a pair of dark slim-cut jeans, a merino crew-neck sweater, and leather Oxford shoes.</p>
        <h3>The Colour Rule</h3>
        <p>Stick to a neutral base — navy, grey, black, white, camel — and introduce one accent colour per season. This ensures every piece in your wardrobe can work with every other piece.</p>
        <h3>Quality Over Quantity</h3>
        <p>Invest in fewer, better pieces. A ₦45,000 blazer that lasts 10 years costs you ₦4,500 a year. A ₦5,000 blazer that falls apart in 6 months costs you ₦10,000 a year. Do the maths.</p>
      `,
      emoji: '👗',
    },
    {
      id: 2,
      title: 'The Return of the Blazer: 2026 Trend Report',
      category: 'Trends',
      date: 'April 28, 2026',
      readTime: '4 min read',
      excerpt: 'The structured blazer is back and it is dominating runways, streets and boardrooms alike. Here is how to wear it in 2026.',
      content: `
        <h2>The Return of the Blazer: 2026 Trend Report</h2>
        <p class="blog-meta">📅 April 28, 2026 &nbsp;·&nbsp; ⏱ 4 min read &nbsp;·&nbsp; 🏷 Trends</p>
        <p>After years of remote-work casualisation, the blazer has staged a dramatic comeback. Not the stiff corporate kind — but a softer, more expressive interpretation that works equally well over a hoodie or a crisp shirt.</p>
        <h3>The Silhouette</h3>
        <p>2026's blazer is slightly oversized in the shoulder with a cropped, boxy body. Think one size up from your usual, worn open over a fitted base layer.</p>
        <h3>How to Style It</h3>
        <p>For the office: Navy blazer + white Oxford shirt + charcoal chinos + leather loafers. For the weekend: tan blazer + white tee + dark jeans + clean white sneakers.</p>
      `,
      emoji: '🕴️',
    },
    {
      id: 3,
      title: 'How to Care for Your Leather Shoes',
      category: 'Care & Maintenance',
      date: 'April 15, 2026',
      readTime: '6 min read',
      excerpt: 'A good pair of leather shoes can last 20 years if you care for them right. Here is the exact routine to follow.',
      content: `
        <h2>How to Care for Your Leather Shoes</h2>
        <p class="blog-meta">📅 April 15, 2026 &nbsp;·&nbsp; ⏱ 6 min read &nbsp;·&nbsp; 🏷 Care &amp; Maintenance</p>
        <p>Quality leather shoes are an investment. The difference between shoes that look beaten after two years and shoes that look better after ten years is entirely about care.</p>
        <h3>Step 1: Clean Before You Polish</h3>
        <p>Use a damp cloth or a dedicated shoe cleaner to remove surface dirt and old polish. Never polish over dirty shoes — you will just lock the dirt in.</p>
        <h3>Step 2: Condition the Leather</h3>
        <p>Apply a small amount of leather conditioner with a soft cloth in circular motions. This restores moisture and prevents cracking. Do this every 4-6 weeks.</p>
      `,
      emoji: '👞',
    },
    {
      id: 4,
      title: 'Dressing for Lagos: Style in Every Season',
      category: 'Local Style',
      date: 'March 30, 2026',
      readTime: '5 min read',
      excerpt: 'Lagos has its own rules. Here is how to look sharp, stay cool, and make an impression in Nigeria\'s style capital.',
      content: `
        <h2>Dressing for Lagos: Style in Every Season</h2>
        <p class="blog-meta">📅 March 30, 2026 &nbsp;·&nbsp; ⏱ 5 min read &nbsp;·&nbsp; 🏷 Local Style</p>
        <p>Lagos is not just a city — it is a statement. And the way you dress in Lagos communicates who you are before you say a word.</p>
        <h3>Fabric is Everything</h3>
        <p>In Lagos, breathable fabrics are non-negotiable. Linen, cotton, and light cotton-blends are your best friends. Avoid thick synthetic fabrics that trap heat.</p>
        <h3>Colour Your World</h3>
        <p>Lagos rewards boldness. While neutrals are safe, do not be afraid of rich tones — cobalt blue, deep green, burnt orange. They photograph beautifully and stand out in the best possible way.</p>
      `,
      emoji: '🌆',
    },
    {
      id: 5,
      title: 'The Ultimate Suit Guide for Nigerian Men',
      category: 'Style Guide',
      date: 'March 12, 2026',
      readTime: '8 min read',
      excerpt: 'Everything you need to know about buying, fitting, and wearing a suit — tailored to the Nigerian man\'s lifestyle and occasions.',
      content: `
        <h2>The Ultimate Suit Guide for Nigerian Men</h2>
        <p class="blog-meta">📅 March 12, 2026 &nbsp;·&nbsp; ⏱ 8 min read &nbsp;·&nbsp; 🏷 Style Guide</p>
        <p>Every Nigerian man needs at least two suits in his wardrobe — one for formal occasions, one for semi-formal.</p>
        <h3>Start With the Fit</h3>
        <p>Nothing matters more than fit. A ₦20,000 suit that fits perfectly will always look better than a ₦200,000 suit that doesn't.</p>
        <h3>Build Your Suit Wardrobe in Order</h3>
        <p>Suit 1: Navy. It works for everything — court, church, weddings, interviews, boardrooms. Suit 2: Charcoal grey. More formal, perfect for high-stakes occasions.</p>
      `,
      emoji: '🤵',
    },
    {
      id: 6,
      title: 'Accessories That Elevate Every Outfit',
      category: 'Accessories',
      date: 'February 20, 2026',
      readTime: '4 min read',
      excerpt: 'The difference between a good outfit and a great one often comes down to the details. Master these accessories.',
      content: `
        <h2>Accessories That Elevate Every Outfit</h2>
        <p class="blog-meta">📅 February 20, 2026 &nbsp;·&nbsp; ⏱ 4 min read &nbsp;·&nbsp; 🏷 Accessories</p>
        <p>Great style is built in layers. Once you have the core pieces right — the suit, the shirt, the trousers — it is the accessories that transform an outfit from good to unforgettable.</p>
        <h3>The Watch</h3>
        <p>A quality watch is the ultimate accessory. It signals taste, punctuality, and attention to detail — all in a single glance.</p>
        <h3>The Belt</h3>
        <p>Always match your belt to your shoes. This single rule eliminates one of the most common style mistakes.</p>
      `,
      emoji: '⌚',
    },
  ],
};
