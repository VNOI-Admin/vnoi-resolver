import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import queryString from 'query-string';
import Select, { MultiValue } from 'react-select';

import { InputData, AwardImageMap, parseInputData } from './resolver';
import { readJsonFile, urlBasename } from './util/files';
import { DEFAULT_FROZEN_TIME_MIN } from './util/urlConfig';

type DropKind = 'data' | 'image';

export function Loading({
  inputData,
  frozenTime,
  unofficialContestants,
  hideUnofficialContestants,
  dataUrl,
  imageUrl,
  setLoading,
  setInputData,
  setImageData,
  setFrozenTime,
  setUnofficialContestants,
  setHideUnofficialContestants
}: {
  inputData: InputData | null;
  frozenTime: number;
  unofficialContestants: string[];
  hideUnofficialContestants: boolean;
  dataUrl: string | null;
  imageUrl: string | null;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setInputData: Dispatch<SetStateAction<InputData | null>>;
  setImageData: Dispatch<SetStateAction<AwardImageMap>>;
  setFrozenTime: Dispatch<SetStateAction<number>>;
  setUnofficialContestants: Dispatch<SetStateAction<string[]>>;
  setHideUnofficialContestants: Dispatch<SetStateAction<boolean>>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DropKind | null>(null);
  const [dataFileName, setDataFileName] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  // Gates the Run button until every ?data= / ?image= fetch has settled,
  // so awards don't silently render without art.
  const [urlFetchPending, setUrlFetchPending] = useState<boolean>(
    !!dataUrl || !!imageUrl
  );

  // Pre-fill from ?data= / ?image= so a recipient re-sharing doesn't have
  // to re-type the hosted URLs.
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareDataUrl, setShareDataUrl] = useState(dataUrl ?? '');
  const [shareImageUrl, setShareImageUrl] = useState(imageUrl ?? '');
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const generatedShareUrl = useMemo(() => {
    const params: Record<string, string> = {};
    if (shareDataUrl) params.data = shareDataUrl;
    if (shareImageUrl) params.image = shareImageUrl;
    if (frozenTime !== DEFAULT_FROZEN_TIME_MIN)
      params.frozenTime = String(frozenTime);
    if (unofficialContestants.length > 0)
      params.unofficial = unofficialContestants.join(',');
    if (!hideUnofficialContestants) params.hideUnofficial = '0';
    const search = queryString.stringify(params);
    const { origin, pathname } = window.location;
    return search ? `${origin}${pathname}?${search}` : `${origin}${pathname}`;
  }, [
    shareDataUrl,
    shareImageUrl,
    frozenTime,
    unofficialContestants,
    hideUnofficialContestants
  ]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedShareUrl);
      setCopyToast('Copied to clipboard');
    } catch {
      setCopyToast('Copy failed — select the link above to copy manually');
    }
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setCopyToast(null);
      toastTimerRef.current = null;
    }, 2500);
  }, [generatedShareUrl]);

  const loadData = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const parsed = await readJsonFile(file, parseInputData);
        setInputData(parsed);
        setDataFileName(file.name);
      } catch (e) {
        setError(`Couldn't parse data file: ${(e as Error).message}`);
        setDataFileName(null);
      }
    },
    [setInputData]
  );

  const loadImage = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const parsed = await readJsonFile(file, (raw) => raw as AwardImageMap);
        setImageData(parsed);
        setImageFileName(file.name);
      } catch (e) {
        setError(`Couldn't parse image file: ${(e as Error).message}`);
        setImageFileName(null);
      }
    },
    [setImageData]
  );

  // Image is optional; data-only URLs must still load.
  useEffect(() => {
    if (!dataUrl && !imageUrl) return;
    let cancelled = false;
    const run = async () => {
      if (dataUrl) {
        try {
          const raw = await (await fetch(dataUrl)).json();
          if (cancelled) return;
          setInputData(parseInputData(raw));
          setDataFileName(urlBasename(dataUrl));
        } catch (e) {
          if (cancelled) return;
          setError(`Couldn't load data URL: ${(e as Error).message}`);
        }
      }
      if (imageUrl) {
        try {
          const raw = (await (await fetch(imageUrl)).json()) as AwardImageMap;
          if (cancelled) return;
          setImageData(raw);
          setImageFileName(urlBasename(imageUrl));
        } catch (e) {
          if (cancelled) return;
          setError(`Couldn't load image URL: ${(e as Error).message}`);
        }
      }
      if (!cancelled) setUrlFetchPending(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [dataUrl, imageUrl, setInputData, setImageData]);

  const onDataChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) loadData(f);
    },
    [loadData]
  );

  const onImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) loadImage(f);
    },
    [loadImage]
  );

  const handleFrozenTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = (e.target as HTMLInputElement).value;
      const n = parseInt(raw, 10);
      setFrozenTime(Math.max(0, Number.isFinite(n) ? n : 0));
    },
    [setFrozenTime]
  );

  const handleSelectChange = useCallback(
    (selectedOptions: MultiValue<{ value: string; label: string }>) => {
      setUnofficialContestants(selectedOptions.map((option) => option.value));
    },
    [setUnofficialContestants]
  );

  const handleCheckboxChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      setHideUnofficialContestants((e.target as HTMLInputElement).checked);
    },
    [setHideUnofficialContestants]
  );

  const handleSubmit = useCallback(() => {
    setLoading(false);
  }, [setLoading]);

  const usernames = useMemo(
    () =>
      inputData?.users?.map((user) => ({
        value: user.username,
        label: user.username
      })) ?? [],
    [inputData]
  );

  // dragleave fires on every child boundary, so we count enters vs leaves
  // to identify the "leave the whole dropzone" event.
  const dragDepth = useRef<Record<DropKind, number>>({ data: 0, image: 0 });
  const dropHandlers = useCallback(
    (kind: DropKind, loader: (f: File) => void) => ({
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current[kind] += 1;
        if (dragDepth.current[kind] === 1) setDragOver(kind);
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current[kind] = Math.max(0, dragDepth.current[kind] - 1);
        if (dragDepth.current[kind] === 0) setDragOver(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current[kind] = 0;
        setDragOver(null);
        const f = e.dataTransfer.files?.[0];
        if (f) loader(f);
      }
    }),
    []
  );

  return (
    <form className="loading-form" onSubmit={(e) => e.preventDefault()}>
      <span className="subtitle">Contest reveal · press H for shortcuts</span>
      <div
        className={`form-group dropzone${dragOver === 'data' ? ' drag-over' : ''}${dataFileName ? ' has-file' : ''}`}
        {...dropHandlers('data', loadData)}
      >
        <label htmlFor="data-input">Data</label>
        <input id="data-input" type="file" onChange={onDataChange} />
        {dataFileName && (
          <span className="file-name" title={dataFileName}>
            {dataFileName}
          </span>
        )}
        <span className="dropzone-hint">or drop a .json file here</span>
      </div>
      <div
        className={`form-group dropzone${dragOver === 'image' ? ' drag-over' : ''}${imageFileName ? ' has-file' : ''}`}
        {...dropHandlers('image', loadImage)}
      >
        <label htmlFor="image-input">Image</label>
        <input id="image-input" type="file" onChange={onImageChange} />
        {imageFileName && (
          <span className="file-name" title={imageFileName}>
            {imageFileName}
          </span>
        )}
        <span className="dropzone-hint">or drop a .json file here</span>
      </div>
      <div className="form-group">
        <label htmlFor="frozen-input">
          Frozen time (since start of contest)
        </label>
        <input
          id="frozen-input"
          type="number"
          value={frozenTime}
          onChange={handleFrozenTimeChange}
        />
      </div>
      <div className="form-group">
        <Select
          placeholder="Unofficial contestants"
          options={usernames}
          isMulti={true}
          closeMenuOnSelect={false}
          hideSelectedOptions={false}
          onChange={handleSelectChange}
        />
      </div>
      <div className="form-group form-check">
        <input
          id="hide-unofficial"
          type="checkbox"
          checked={hideUnofficialContestants}
          onChange={handleCheckboxChange}
        />
        <label htmlFor="hide-unofficial">Hide unofficial contestants</label>
      </div>
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => setShowShareModal(true)}
        >
          Generate share link
        </button>
        <button
          type="button"
          className="primary"
          disabled={!inputData || urlFetchPending}
          onClick={handleSubmit}
          title={urlFetchPending ? 'Loading data/image from URL…' : undefined}
        >
          {urlFetchPending ? 'Loading…' : 'Run'}
        </button>
      </div>
      {showShareModal && (
        <div
          className="share-modal-overlay"
          onClick={() => setShowShareModal(false)}
        >
          <div className="share-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Generate share link</h3>
            <p className="hint">
              Paste public URLs for your hosted data and image files. Local file
              uploads can&apos;t be embedded — host the JSON on a gist, S3, or
              your own server first. The link also captures ceremony settings
              (frozen time, unofficial contestants, hide flag).
            </p>
            <label className="share-field">
              <span>Data URL</span>
              <input
                type="url"
                value={shareDataUrl}
                placeholder="https://example.com/data.json"
                onChange={(e) => setShareDataUrl(e.target.value)}
              />
            </label>
            <label className="share-field">
              <span>
                Image URL <em>(optional)</em>
              </span>
              <input
                type="url"
                value={shareImageUrl}
                placeholder="https://example.com/images.json"
                onChange={(e) => setShareImageUrl(e.target.value)}
              />
            </label>
            <label className="share-field">
              <span>Generated link</span>
              <textarea
                readOnly
                rows={3}
                value={generatedShareUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            {copyToast && (
              <div className="share-toast" role="status">
                {copyToast}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowShareModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleCopyShareLink}
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
