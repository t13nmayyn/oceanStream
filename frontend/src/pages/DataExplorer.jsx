import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Database, FileText, CheckCircle2, Clock, AlertTriangle,
  Layers, RefreshCw, BarChart2, Eye, Compass, Calendar
} from 'lucide-react';
import AppNav from '../components/navigation/AppNav';
import { useAppDispatch } from '../context/AppContext';
import {
  uploadDatasetFile,
  getUploadedDatasets,
  getUploadedDatasetSnapshot,
} from '../services/oceanApi';

export default function DataExplorer() {
  const dispatch = useAppDispatch();
  const fileInputRef = useRef(null);

  const [datasets, setDatasets] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // Snapshot / Inspection state
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotData, setSnapshotData] = useState(null);
  const [selectedVariable, setSelectedVariable] = useState('');
  const [selectedDepth, setSelectedDepth] = useState(0);

  // Fetch dataset list
  const fetchDatasets = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await getUploadedDatasets();
      setDatasets(list);
      // If none selected and list not empty, select first
      if (!selectedDataset && list.length > 0) {
        setSelectedDataset(list[0]);
      } else if (selectedDataset) {
        // update reference in case status changed
        const updated = list.find((d) => d.dataset_id === selectedDataset.dataset_id);
        if (updated) setSelectedDataset(updated);
      }
    } catch (err) {
      console.error('Failed to load datasets:', err);
    } finally {
      setLoadingList(false);
    }
  }, [selectedDataset]);

  useEffect(() => {
    fetchDatasets();
    // Poll every 4 seconds to check if background ingestion completed
    const interval = setInterval(fetchDatasets, 4000);
    return () => clearInterval(interval);
  }, [fetchDatasets]);

  // Load snapshot when selectedDataset or variable changes
  useEffect(() => {
    if (!selectedDataset || selectedDataset.status !== 'ready') {
      setSnapshotData(null);
      return;
    }

    let active = true;
    async function loadSnapshot() {
      setSnapshotLoading(true);
      try {
        const snap = await getUploadedDatasetSnapshot(
          selectedDataset.dataset_id,
          selectedVariable,
          selectedDepth
        );
        if (active) {
          setSnapshotData(snap);
          if (!selectedVariable && snap.variable) {
            setSelectedVariable(snap.variable);
          }
        }
      } catch (err) {
        if (active) {
          console.warn('Snapshot fetch error:', err);
          setSnapshotData(null);
        }
      } finally {
        if (active) setSnapshotLoading(false);
      }
    }
    loadSnapshot();

    return () => {
      active = false;
    };
  }, [selectedDataset, selectedVariable, selectedDepth]);

  // File upload handler
  const handleFileUpload = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['nc', 'netcdf', 'csv'].includes(ext)) {
      dispatch({
        type: 'ADD_TOAST',
        payload: { msg: 'Unsupported file type. Use .nc, .netcdf, or .csv', variant: 'error' },
      });
      return;
    }

    setUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);
    try {
      const res = await uploadDatasetFile(file);
      dispatch({
        type: 'ADD_TOAST',
        payload: { msg: `Dataset uploaded: ${file.name}. Ingestion started.`, variant: 'success' },
      });
      await fetchDatasets();
      // Select newly uploaded entry if available
      const createdId = res.dataset_id;
      if (createdId) {
        setSelectedDataset({ dataset_id: createdId, filename: file.name, status: 'processing' });
      }
    } catch (err) {
      dispatch({
        type: 'ADD_TOAST',
        payload: { msg: `Upload failed: ${err.message}`, variant: 'error' },
      });
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Compute basic stats on current snapshot
  const gridPoints = snapshotData?.grid || [];
  const validValues = gridPoints.map((p) => p.value).filter((v) => v !== null && v !== undefined);
  const minVal = validValues.length ? Math.min(...validValues).toFixed(2) : '—';
  const maxVal = validValues.length ? Math.max(...validValues).toFixed(2) : '—';
  const meanVal = validValues.length
    ? (validValues.reduce((a, b) => a + b, 0) / validValues.length).toFixed(2)
    : '—';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      <AppNav />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6 mt-14">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <Database className="text-cyan-400" size={24} />
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                Data Explorer & Offline Ingestion
              </h1>
              <span className="px-2 py-0.5 text-xs rounded-full bg-cyan-950 border border-cyan-700/50 text-cyan-300 font-mono">
                source: user_upload
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-400 mt-1">
              Upload local NetCDF or CSV ocean cruise datasets. Data is ingested into local high-speed Zarr stores and marked with offline provenance.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDatasets}
              disabled={loadingList}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 transition-colors"
            >
              <RefreshCw size={13} className={loadingList ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Upload Box */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
            dragActive
              ? 'border-cyan-400 bg-cyan-950/20'
              : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".nc,.netcdf,.csv"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
          />

          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Upload size={20} className={uploading ? 'animate-bounce' : ''} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-200">
                {uploading ? uploadProgress : 'Drag and drop your ocean dataset, or browse'}
              </p>
              <p className="text-xs text-slate-400">
                Supports NetCDF (.nc, .netcdf) and cruise tabular data (.csv with lat, lon, time, depth)
              </p>
            </div>
            <button
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-4 py-1.5 text-xs font-semibold rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-50"
            >
              Select File
            </button>
          </div>
        </div>

        {/* Content Layout: Dataset List + Details/Snapshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Datasets Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers size={13} className="text-cyan-400" />
                Uploaded Datasets ({datasets.length})
              </h2>
            </div>

            {datasets.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center text-xs text-slate-500">
                No offline datasets uploaded yet. Upload a .nc or .csv above to get started.
              </div>
            ) : (
              <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
                {datasets.map((ds) => {
                  const isSelected = selectedDataset?.dataset_id === ds.dataset_id;
                  const isReady = ds.status === 'ready';
                  const isProcessing = ds.status === 'processing';
                  const isError = ds.status === 'error';

                  return (
                    <div
                      key={ds.dataset_id}
                      onClick={() => {
                        setSelectedDataset(ds);
                        setSelectedVariable(ds.variables?.[0] || '');
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800/80 border-cyan-500/60 shadow-lg shadow-cyan-950/20'
                          : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <FileText size={16} className={isSelected ? 'text-cyan-400' : 'text-slate-400'} />
                          <span className="text-xs font-medium text-slate-200 truncate">{ds.filename}</span>
                        </div>
                        {isReady && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-1.5 py-0.5 rounded">
                            <CheckCircle2 size={10} /> Ready
                          </span>
                        )}
                        {isProcessing && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/50 border border-amber-800/50 px-1.5 py-0.5 rounded animate-pulse">
                            <Clock size={10} /> Ingesting
                          </span>
                        )}
                        {isError && (
                          <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-950/50 border border-red-800/50 px-1.5 py-0.5 rounded">
                            <AlertTriangle size={10} /> Error
                          </span>
                        )}
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-mono text-slate-400">ID: {ds.dataset_id}</span>
                        <span>{ds.uploaded_at ? new Date(ds.uploaded_at).toLocaleDateString() : '—'}</span>
                      </div>

                      {ds.variables?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {ds.variables.slice(0, 3).map((v) => (
                            <span key={v} className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-cyan-300 font-mono">
                              {v}
                            </span>
                          ))}
                          {ds.variables.length > 3 && (
                            <span className="text-[10px] text-slate-500">+{ds.variables.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dataset View / Inspection */}
          <div className="lg:col-span-8 space-y-4">
            {selectedDataset ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-5">
                {/* Top Dataset Info */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-white">{selectedDataset.filename}</h2>
                      <span className="text-xs text-slate-400 font-mono">({selectedDataset.dataset_id})</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Provenance: <span className="text-cyan-400 font-mono">user_upload</span> (Offline Zarr isolated from live feed)
                    </p>
                  </div>

                  {selectedDataset.status === 'ready' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Variable:</span>
                      <select
                        value={selectedVariable}
                        onChange={(e) => setSelectedVariable(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1 font-mono focus:outline-none focus:border-cyan-400"
                      >
                        {(selectedDataset.variables || []).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Status or Error Display */}
                {selectedDataset.status === 'processing' && (
                  <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs text-amber-300 flex items-center gap-3">
                    <Clock className="animate-spin" size={16} />
                    <div>
                      <p className="font-semibold">Dataset Ingestion in Progress</p>
                      <p className="text-amber-400/80 mt-0.5">
                        Normalizing spatial/temporal dimensions and consolidating chunks into local Zarr storage.
                      </p>
                    </div>
                  </div>
                )}

                {selectedDataset.status === 'error' && (
                  <div className="p-4 rounded-lg bg-red-950/20 border border-red-800/40 text-xs text-red-300 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle size={14} /> Ingestion Error
                    </p>
                    <p className="font-mono text-red-400">{selectedDataset.error || 'Unknown parsing error'}</p>
                  </div>
                )}

                {selectedDataset.status === 'ready' && (
                  <>
                    {/* Metadata Badges */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Compass size={11} className="text-cyan-400" /> Bounding Box
                        </div>
                        <div className="text-xs font-mono text-slate-200 mt-1 truncate">
                          {selectedDataset.bbox?.lat_min ?? '—'}° to {selectedDataset.bbox?.lat_max ?? '—'}° N
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {selectedDataset.bbox?.lon_min ?? '—'}° to {selectedDataset.bbox?.lon_max ?? '—'}° E
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Calendar size={11} className="text-cyan-400" /> Time Range
                        </div>
                        <div className="text-xs font-mono text-slate-200 mt-1 truncate">
                          {selectedDataset.time_range?.start || 'N/A'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          to {selectedDataset.time_range?.end || 'N/A'}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Layers size={11} className="text-cyan-400" /> Grid Points
                        </div>
                        <div className="text-base font-bold font-mono text-cyan-400 mt-0.5">
                          {snapshotLoading ? '...' : gridPoints.length}
                        </div>
                        <div className="text-[10px] text-slate-400">slice points</div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <BarChart2 size={11} className="text-cyan-400" /> Stats ({selectedVariable || '—'})
                        </div>
                        <div className="text-xs font-mono text-slate-200 mt-1">
                          min: <span className="text-cyan-300">{minVal}</span> | max:{' '}
                          <span className="text-amber-300">{maxVal}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">mean: {meanVal}</div>
                      </div>
                    </div>

                    {/* Snapshot Slice Table Preview */}
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Eye size={13} className="text-cyan-400" />
                          Spatial Grid Data Preview ({gridPoints.length} points)
                        </h3>
                        {snapshotLoading && (
                          <span className="text-xs text-cyan-400 animate-pulse">Loading slice...</span>
                        )}
                      </div>

                      <div className="border border-slate-800 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-950/80 text-slate-400 text-[11px] sticky top-0 border-b border-slate-800">
                            <tr>
                              <th className="p-2.5">#</th>
                              <th className="p-2.5">Latitude (°N)</th>
                              <th className="p-2.5">Longitude (°E)</th>
                              <th className="p-2.5">{selectedVariable || 'Value'}</th>
                              <th className="p-2.5">Source Tag</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50 text-slate-300">
                            {gridPoints.slice(0, 100).map((pt, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/30">
                                <td className="p-2 text-slate-500">{idx + 1}</td>
                                <td className="p-2">{pt.lat?.toFixed(4)}</td>
                                <td className="p-2">{pt.lon?.toFixed(4)}</td>
                                <td className="p-2 font-semibold text-cyan-300">
                                  {pt.value !== null && pt.value !== undefined ? pt.value : '—'}
                                </td>
                                <td className="p-2 text-[10px] text-slate-400">{pt.source || 'user_upload'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {gridPoints.length > 100 && (
                          <div className="p-2 text-center text-[11px] text-slate-500 bg-slate-950/50">
                            Showing first 100 of {gridPoints.length} sampled points.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="p-12 rounded-xl bg-slate-900/30 border border-slate-800/60 text-center text-slate-400 space-y-2">
                <Database size={28} className="mx-auto text-slate-600" />
                <p className="text-sm font-medium">Select a dataset from the list to explore</p>
                <p className="text-xs text-slate-500">
                  Or upload a new NetCDF / CSV file to parse its variables and coordinates.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
