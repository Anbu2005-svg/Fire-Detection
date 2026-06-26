import { useRef, useState, useCallback } from 'react';

export default function UploadArea({ onImageSelected }) {
  const inputRef = useRef(null);
  const [isDragover, setIsDragover] = useState(false);

  const handleFile = useCallback(
    (file) => {
      if (file) onImageSelected(file);
    },
    [onImageSelected]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragover(false);
      const [file] = e.dataTransfer.files;
      handleFile(file);
    },
    [handleFile]
  );

  return (
    <button
      className={`upload-area ${isDragover ? 'dragover' : ''}`}
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDragover(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragover(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragover(false);
      }}
      onDrop={handleDrop}
      aria-describedby="uploadHint"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const [file] = e.target.files;
          handleFile(file);
          e.target.value = '';
        }}
      />
      <span className="upload-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 3 7.5 7.5l1.4 1.4 2.1-2.1V15h2V6.8l2.1 2.1 1.4-1.4L12 3ZM5 13v6h14v-6h2v8H3v-8h2Z" />
        </svg>
      </span>
      <strong>Drop an image here</strong>
      <span>or click to browse your device</span>
      <small id="uploadHint">Maximum 10 MB before optimization</small>
    </button>
  );
}
