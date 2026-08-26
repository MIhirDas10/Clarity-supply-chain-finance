import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  UploadCloud, 
  Trash2, 
  Edit3, 
  Eye, 
  Download,
  AlertCircle 
} from 'lucide-react';

const DocumentVault = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Upload Form State
  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState('Trade License');
  const [notes, setNotes] = useState('');

  // Edit Modal State
  const [editingDoc, setEditingDoc] = useState(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/documents');
      if (!response.ok) throw new Error('Failed to fetch documents');
      const data = await response.json();
      setDocuments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFile({
          data: reader.result,
          name: selected.name,
          type: selected.type
        });
      };
      reader.readAsDataURL(selected);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please select a file to upload');

    setUploading(true);
    setError('');

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: file.data,
          file_name: file.name,
          doc_type: docType,
          notes: notes
        })
      });

      if (!response.ok) throw new Error('Failed to upload document');
      
      // Reset form and refresh list
      setFile(null);
      setDocType('Trade License');
      setNotes('');
      await fetchDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    
    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete document');
      
      setDocuments(documents.filter(doc => doc.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/documents/${editingDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type: editingDoc.doc_type,
          notes: editingDoc.notes
        })
      });
      if (!response.ok) throw new Error('Failed to update document');
      
      setEditingDoc(null);
      await fetchDocuments();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900">Document Vault</h1>
          <p className="text-slate-500 mt-1">Securely store and manage your KYB documents and contracts.</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 text-red-700 bg-red-100 rounded-lg border border-red-200">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Upload Section */}
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 sticky top-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <UploadCloud className="text-slate-500" />
                Upload Document
              </h2>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Document Type</label>
                  <select 
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="Trade License">Trade License</option>
                    <option value="TIN Certificate">TIN Certificate</option>
                    <option value="Bank Account Proof">Bank Account Proof</option>
                    <option value="Buyer Contract">Buyer Contract</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">File</label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md hover:bg-slate-50 transition">
                    <div className="space-y-1 text-center">
                      <FileText className="mx-auto h-12 w-12 text-slate-400" />
                      <div className="flex text-sm text-slate-600">
                        <label className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500">
                          <span>{file ? file.name : 'Upload a file'}</span>
                          <input type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg" />
                        </label>
                      </div>
                      <p className="text-xs text-slate-500">PNG, JPG, PDF up to 10MB</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-slate-900"
                    rows="2"
                    placeholder="e.g., Valid until Dec 2026"
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={uploading || !file}
                  className="w-full py-2 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Save Document'}
                </button>
              </form>
            </div>
          </div>

          {/* List Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-xl font-bold text-slate-900">Your Documents</h2>
              </div>
              
              {loading ? (
                <div className="p-8 text-center text-slate-500">Loading documents...</div>
              ) : documents.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No documents found in your vault.</div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {documents.map((doc) => (
                    <div key={doc.id} className="p-6 hover:bg-slate-50 transition flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                          <FileText size={24} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 flex items-center">
                            {doc.doc_type}
                            <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              doc.status === 'Approved' ? 'bg-green-100 text-green-800' :
                              doc.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {doc.status || 'Pending'}
                            </span>
                          </h3>
                          <p className="text-sm text-slate-500 font-medium truncate max-w-xs">{doc.file_name || 'Document'}</p>
                          {doc.notes && <p className="text-sm text-slate-600 mt-1">{doc.notes}</p>}
                          <p className="text-xs text-slate-400 mt-2">
                            Uploaded on {new Date(doc.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a 
                          href={doc.file_url?.includes('cloudinary.com') 
                            ? doc.file_url.replace('/upload/', '/upload/fl_attachment/')
                            : doc.file_url} 
                          download={doc.file_name || 'document'}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                          title="Download"
                        >
                          <Download size={18} />
                        </a>
                        <button 
                          onClick={() => setEditingDoc(doc)}
                          className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                          title="Edit"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(doc.id)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Edit Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl border border-slate-200">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Edit Document</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Document Type</label>
                <select 
                  value={editingDoc.doc_type}
                  onChange={(e) => setEditingDoc({...editingDoc, doc_type: e.target.value})}
                  className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-slate-900"
                >
                  <option value="Trade License">Trade License</option>
                  <option value="TIN Certificate">TIN Certificate</option>
                  <option value="Bank Account Proof">Bank Account Proof</option>
                  <option value="Buyer Contract">Buyer Contract</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea 
                  value={editingDoc.notes || ''}
                  onChange={(e) => setEditingDoc({...editingDoc, notes: e.target.value})}
                  className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-slate-900"
                  rows="3"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentVault;
