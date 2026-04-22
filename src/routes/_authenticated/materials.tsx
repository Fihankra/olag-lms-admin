import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "../../hooks/use-auth";
import {
  FolderOpen,
  FolderPlus,
  Upload,
  Trash2,
  ArrowLeft,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  Settings2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/materials")({
  component: MaterialsPage,
  head: () => ({
    meta: [
      { title: "Materials — OLAG LMS" },
      { name: "description", content: "Manage learning materials, files, and folder access" },
    ],
  }),
});

type Folder = {
  id: string;
  name: string;
  accessible_programs: string[];
  accessible_classes: string[];
  created_by: string | null;
  created_at: string;
};

type FileItem = {
  id: string;
  folder_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  created_by: string | null;
  created_at: string;
};

type Program = { id: string; name: string };
type ClassItem = { id: string; name: string; program_id?: string };

function fileIcon(type: string) {
  if (type.startsWith("image")) return FileImage;
  if (type.startsWith("video")) return FileVideo;
  if (type.startsWith("audio")) return FileAudio;
  if (type.includes("pdf") || type.includes("doc") || type.includes("text")) return FileText;
  return File;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type TeacherUser = { user_id: string; name: string };

function MaterialsPage() {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const userId = user?.id ?? null;
  const [creators, setCreators] = useState<Map<string, string>>(new Map());

  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [activeFolder, setActiveFolder] = useState<Folder | null>(null);

  // Modals
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [uploading, setUploading] = useState(false);

  // Access edit state (admin only)
  const [editPrograms, setEditPrograms] = useState<string[]>([]);
  const [editClasses, setEditClasses] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function canManageFolder(folder: Folder) {
    return isAdmin || (userId != null && folder.created_by === userId);
  }

  function canManageFile(file: FileItem) {
    return isAdmin || (userId != null && file.created_by === userId);
  }

  async function fetchFolders() {
    const { data } = await supabase.from("folders").select("*").order("created_at", { ascending: false });
    setFolders((data as Folder[]) ?? []);
  }

  async function fetchFiles(folderId: string) {
    const { data } = await supabase.from("files").select("*").eq("folder_id", folderId).order("created_at", { ascending: false });
    setFiles((data as FileItem[]) ?? []);
  }

  async function fetchMeta() {
    const [p, c] = await Promise.all([
      supabase.from("programs").select("id, name"),
      supabase.from("classes").select("id, name, program_id"),
    ]);
    setPrograms(p.data ?? []);
    setClasses((c.data as ClassItem[]) ?? []);
  }

  useEffect(() => { fetchFolders(); fetchMeta(); }, []);

  useEffect(() => {
    if (activeFolder) fetchFiles(activeFolder.id);
  }, [activeFolder]);

  async function createFolder() {
    if (!folderName.trim()) return;
    await supabase.from("folders").insert({ name: folderName.trim(), created_by: userId });
    setFolderName("");
    setShowNewFolder(false);
    fetchFolders();
  }

  async function deleteFolder(id: string) {
    const { data: folderFiles } = await supabase.from("files").select("file_url").eq("folder_id", id);
    if (folderFiles?.length) {
      const paths = folderFiles.map((f) => {
        const url = new URL(f.file_url);
        return url.pathname.split("/materials/")[1];
      }).filter(Boolean);
      if (paths.length) await supabase.storage.from("materials").remove(paths);
    }
    await supabase.from("folders").delete().eq("id", id);
    if (activeFolder?.id === id) { setActiveFolder(null); setFiles([]); }
    fetchFolders();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeFolder || !e.target.files?.length) return;
    setUploading(true);
    const uploadedFiles: FileItem[] = [];

    for (const file of Array.from(e.target.files)) {
      const path = `${activeFolder.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("materials").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) { console.error(error); continue; }

      const { data: urlData } = supabase.storage.from("materials").getPublicUrl(path);

      const { data: inserted } = await supabase.from("files").insert({
        folder_id: activeFolder.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type || "unknown",
        file_size: file.size,
        created_by: userId,
      }).select().single();

      if (inserted) uploadedFiles.push(inserted as FileItem);
    }

    setFiles((prev) => [...uploadedFiles, ...prev]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteFile(file: FileItem) {
    const parts = file.file_url.split("/materials/");
    if (parts[1]) await supabase.storage.from("materials").remove([parts[1]]);
    await supabase.from("files").delete().eq("id", file.id);
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
  }

  function openAccessModal(folder: Folder) {
    setEditPrograms(folder.accessible_programs ?? []);
    setEditClasses(folder.accessible_classes ?? []);
    setShowAccessModal(folder);
  }

  async function saveAccess() {
    if (!showAccessModal) return;
    await supabase.from("folders").update({
      accessible_programs: editPrograms,
      accessible_classes: editClasses,
    }).eq("id", showAccessModal.id);
    setShowAccessModal(null);
    fetchFolders();
    if (activeFolder?.id === showAccessModal.id) {
      setActiveFolder({ ...activeFolder, accessible_programs: editPrograms, accessible_classes: editClasses });
    }
  }

  function toggleItem(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  }

  const programMap = useMemo(() => new Map(programs.map((p) => [p.id, p.name])), [programs]);
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

  function accessLabel(folder: Folder) {
    const pNames = (folder.accessible_programs ?? []).map((id) => programMap.get(id)).filter(Boolean);
    const cNames = (folder.accessible_classes ?? []).map((id) => classMap.get(id)).filter(Boolean);
    const parts = [...pNames, ...cNames];
    if (!parts.length) return "All";
    return parts.join(", ");
  }

  // ---- File view inside folder ----
  if (activeFolder) {
    return (
      <div>
        <PageHeader
          title={activeFolder.name}
          description={isAdmin ? `Access: ${accessLabel(activeFolder)}` : "Learning materials"}
          actions={
            <div className="flex gap-2">
              {isAdmin && (
                <button onClick={() => openAccessModal(activeFolder)} className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-1.5">
                  <Settings2 className="h-4 w-4" /> Access
                </button>
              )}
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload Files"}
              </button>
            </div>
          }
        />

        <button onClick={() => { setActiveFolder(null); setFiles([]); }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to folders
        </button>

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />

        {files.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">No files yet</h2>
            <p className="text-sm text-muted-foreground mb-4">Upload files to this folder to get started.</p>
            <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5">
              <Upload className="h-4 w-4" /> Upload Files
            </button>
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border divide-y divide-border">
            {files.map((file) => {
              const Icon = fileIcon(file.file_type);
              return (
                <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-foreground hover:underline truncate block">{file.file_name}</a>
                    <span className="text-xs text-muted-foreground">{formatSize(file.file_size)} · {new Date(file.created_at).toLocaleDateString()}</span>
                  </div>
                  {canManageFile(file) && (
                    <button onClick={() => deleteFile(file)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors" title="Delete file">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showAccessModal && <AccessModal programs={programs} classes={classes} editPrograms={editPrograms} editClasses={editClasses} setEditPrograms={setEditPrograms} setEditClasses={setEditClasses} toggleItem={toggleItem} onSave={saveAccess} onClose={() => setShowAccessModal(null)} folderName={showAccessModal.name} />}
      </div>
    );
  }

  // ---- Folder list view ----
  return (
    <div>
      <PageHeader
        title="Materials"
        description="Organize and distribute learning materials"
        actions={
          <button onClick={() => setShowNewFolder(true)} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5">
            <FolderPlus className="h-4 w-4" /> New Folder
          </button>
        }
      />

      {folders.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No folders yet</h2>
          <p className="text-sm text-muted-foreground">Create a folder to start uploading materials.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map((folder) => (
            <div key={folder.id} className="bg-card rounded-lg border border-border p-4 hover:border-primary/40 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <button onClick={() => setActiveFolder(folder)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                  <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-medium text-foreground truncate">{folder.name}</span>
                </button>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isAdmin && (
                    <button onClick={() => openAccessModal(folder)} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Access settings">
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canManageFolder(folder) && (
                    <button onClick={() => deleteFolder(folder.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive" title="Delete folder">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {isAdmin ? `Access: ${accessLabel(folder)}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">New Folder</h2>
            <input placeholder="Folder name" value={folderName} onChange={(e) => setFolderName(e.target.value)} className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm mb-4" autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewFolder(false)} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">Cancel</button>
              <button onClick={createFolder} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Create</button>
            </div>
          </div>
        </div>
      )}

      {showAccessModal && <AccessModal programs={programs} classes={classes} editPrograms={editPrograms} editClasses={editClasses} setEditPrograms={setEditPrograms} setEditClasses={setEditClasses} toggleItem={toggleItem} onSave={saveAccess} onClose={() => setShowAccessModal(null)} folderName={showAccessModal.name} />}
    </div>
  );
}

function AccessModal({
  programs, classes, editPrograms, editClasses, setEditPrograms, setEditClasses, toggleItem, onSave, onClose, folderName,
}: {
  programs: Program[]; classes: ClassItem[]; editPrograms: string[]; editClasses: string[];
  setEditPrograms: (v: string[]) => void; setEditClasses: (v: string[]) => void;
  toggleItem: (arr: string[], id: string) => string[]; onSave: () => void; onClose: () => void; folderName: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">Access Settings</h2>
        <p className="text-sm text-muted-foreground mb-4">Folder: {folderName}</p>

        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2">Programs</h3>
          <div className="flex flex-wrap gap-2">
            {programs.length === 0 && <span className="text-xs text-muted-foreground">No programs</span>}
            {programs.map((p) => (
              <button key={p.id} onClick={() => setEditPrograms(toggleItem(editPrograms, p.id))} className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${editPrograms.includes(p.id) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border"}`}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2">Classes</h3>
          <div className="flex flex-wrap gap-2">
            {classes.length === 0 && <span className="text-xs text-muted-foreground">No classes</span>}
            {classes.map((c) => (
              <button key={c.id} onClick={() => setEditClasses(toggleItem(editClasses, c.id))} className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${editClasses.includes(c.id) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border"}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-4">Leave both empty to make the folder accessible to all.</p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Save</button>
        </div>
      </div>
    </div>
  );
}
