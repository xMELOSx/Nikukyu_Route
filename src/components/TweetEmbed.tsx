import React, { useRef, useState, useEffect } from 'react';

// TweetEmbed Component using official Twitter widgets SDK
const TweetEmbed: React.FC<{ url: string }> = ({ url }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(!!(window as any).twttr);

  useEffect(() => {
    if ((window as any).twttr) {
      setSdkReady(true);
      return;
    }

    let script = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]') as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.setAttribute('src', 'https://platform.twitter.com/widgets.js');
      script.setAttribute('charset', 'utf-8');
      script.setAttribute('async', 'true');
      document.head.appendChild(script);
    }

    const handleLoad = () => setSdkReady(true);
    script.addEventListener('load', handleLoad);
    return () => {
      script.removeEventListener('load', handleLoad);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    if (sdkReady && (window as any).twttr) {
      const tweetId = url.split('/status/')[1]?.split('?')[0];
      if (tweetId) {
        (window as any).twttr.widgets.createTweet(tweetId, containerRef.current, {
          theme: 'dark',
          align: 'center'
        }).then((el: any) => {
          if (!active && el) {
            el.remove();
          }
        }).catch((err: any) => {
          console.error('Failed to create tweet widget:', err);
        });
      } else {
        renderFallback();
      }
    } else {
      renderFallback();
    }

    function renderFallback() {
      if (!containerRef.current) return;
      const placeholder = document.createElement('div');
      placeholder.className = 'twitter-tweet-placeholder';
      placeholder.style.padding = '16px';
      placeholder.style.textAlign = 'center';
      placeholder.style.color = 'var(--text-muted, #888)';
      placeholder.style.fontSize = '12px';
      
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View Tweet on X / Twitter';
      link.style.color = 'var(--accent-cyan, #00f0ff)';
      link.style.textDecoration = 'underline';
      link.style.display = 'block';
      link.style.marginTop = '4px';

      placeholder.textContent = 'Loading Tweet...';
      placeholder.appendChild(link);
      containerRef.current.appendChild(placeholder);
    }

    return () => {
      active = false;
    };
  }, [url, sdkReady]);

  return <div ref={containerRef} className="twitter-tweet-container" />;
};

export default TweetEmbed;
