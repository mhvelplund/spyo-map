import { useState, useCallback } from 'react';
import type { SocialShareProps } from '../types';
import './SocialShare.css';

const SocialShare: React.FC<SocialShareProps> = ({ imageUrl, imageTitle }) => {
  const [copySuccess, setCopySuccess] = useState(false);

  // Get the full URL for sharing
  const getFullUrl = useCallback(() => {
    const baseUrl = window.location.origin;
    return `${baseUrl}${imageUrl}`;
  }, [imageUrl]);

  // Handle Twitter/X sharing
  const handleTwitterShare = useCallback(() => {
    const fullUrl = getFullUrl();
    const text = imageTitle ? `Check out this photo: ${imageTitle}` : 'Check out this photo!';
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(fullUrl)}`;
    
    window.open(twitterUrl, '_blank', 'width=550,height=420,scrollbars=yes,resizable=yes');
  }, [getFullUrl, imageTitle]);

  // Handle Facebook sharing
  const handleFacebookShare = useCallback(() => {
    const fullUrl = getFullUrl();
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`;
    
    window.open(facebookUrl, '_blank', 'width=580,height=296,scrollbars=yes,resizable=yes');
  }, [getFullUrl]);

  // Handle Instagram sharing (copy to clipboard)
  const handleInstagramShare = useCallback(async () => {
    try {
      const fullUrl = getFullUrl();
      await navigator.clipboard.writeText(fullUrl);
      setCopySuccess(true);
      
      // Reset success message after 2 seconds
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = getFullUrl();
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
      }
      document.body.removeChild(textArea);
    }
  }, [getFullUrl]);

  return (
    <div className="social-share">
      <h3 className="social-share-title">Share this photo</h3>
      <div className="social-share-buttons">
        <button
          className="social-share-button twitter"
          onClick={handleTwitterShare}
          aria-label="Share on Twitter/X"
          type="button"
        >
          <i className="fab fa-twitter" aria-hidden="true"></i>
          <span>Twitter</span>
        </button>
        
        <button
          className="social-share-button facebook"
          onClick={handleFacebookShare}
          aria-label="Share on Facebook"
          type="button"
        >
          <i className="fab fa-facebook-f" aria-hidden="true"></i>
          <span>Facebook</span>
        </button>
        
        <button
          className="social-share-button instagram"
          onClick={handleInstagramShare}
          aria-label="Copy link for Instagram sharing"
          type="button"
        >
          <i className="fab fa-instagram" aria-hidden="true"></i>
          <span>{copySuccess ? 'Copied!' : 'Copy Link'}</span>
        </button>
      </div>
      
      {copySuccess && (
        <output className="copy-success-message" aria-live="polite">
          Link copied to clipboard! You can now paste it in Instagram.
        </output>
      )}
    </div>
  );
};

export default SocialShare;