import { useEffect, useMemo } from 'react';

export default function ImagePreview({ imageFile, onRemove }) {
  const previewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="preview-card">
      <div className="preview-toolbar">
        <span>Source image</span>
        {imageFile && (
          <button className="icon-button" type="button" aria-label="Remove selected image" onClick={onRemove}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7.8 6.4 4.2 4.2 4.2-4.2 1.4 1.4-4.2 4.2 4.2 4.2-1.4 1.4-4.2-4.2-4.2 4.2-1.4-1.4 4.2-4.2-4.2-4.2 1.4-1.4Z" />
            </svg>
          </button>
        )}
      </div>
      <div className="image-stage">
        {imageFile && previewUrl ? (
          <img src={previewUrl} alt="Selected scene preview" />
        ) : (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v14H4V5Zm2 2v8.2l3.4-3.4 2.6 2.6 2.4-2.4 3.6 3.6V7H6Zm2.3 3.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z" />
            </svg>
            <strong>No scene selected</strong>
            <span>Your image preview will appear here</span>
          </div>
        )}
      </div>
    </div>
  );
}
