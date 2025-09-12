// Add this to NoteEditor component or create a wrapper

const PaperBackground = ({ pattern }) => {
  return <div className={`paper-background ${pattern}`} />;
};

const NoteEditorWithBackground = ({ pattern = 'paper-lined', ...props }) => {
  return (
    <div className="note-editor-wrapper">
      <PaperBackground pattern={pattern} />
      <div className="note-editor-content">
        {/* Editor content here */}
      </div>
    </div>
  );
};
