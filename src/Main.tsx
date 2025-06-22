import {
  AppBar,
  Box,
  Button,
  Container,
  createTheme,
  CssBaseline,
  Drawer,
  IconButton,
  Input,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Modal,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  ArrowUpward,
  CreateNewFolder,
  Delete,
  Download,
  DriveFileRenameOutline,
  InsertDriveFile,
  MoreVert,
  Refresh,
  UploadFile,
} from '@mui/icons-material';
import React, { DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { R2ObjectWithSize } from '../functions/list';
import Breadcrumbs from './Breadcrumbs';
import FileTable from './FileTable';
import prettyBytes from 'pretty-bytes';
import { ThemeOptions } from '@mui/material/styles/createTheme';
import TextPadDrawer from './TextPadDrawer';

// 辅助函数：格式化字节大小
function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function Main() {
  const [files, setFiles] = useState<R2ObjectWithSize[]>([]);
  const [path, setPath] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadDrawer, setUploadDrawer] = useState(false);
  const [createFolderModal, setCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameModal, setRenameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteModal, setDeleteModal] = useState(false);
  const [selected, setSelected] = useState<R2ObjectWithSize | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [textPad, setTextPad] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // 新增 state 用于存储和加载状态
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);

  const prefix = useMemo(() => path.join('/') + (path.length > 0 ? '/' : ''), [path]);

  const filteredFiles = useMemo(
    () => files.filter(f => f.key.substring(prefix.length).toLowerCase().includes(search.toLowerCase())),
    [files, prefix, search],
  );

  const open = Boolean(anchorEl);

  const theme = useMemo(() => {
    const themeOptions: ThemeOptions = {
      palette: {
        mode: 'light',
      },
    };
    return createTheme(themeOptions);
  }, []);

  const fetchFiles = useCallback(() => {
    setLoading(true);
    const url = '/api/list?prefix=' + encodeURIComponent(prefix);
    fetch(url)
      .then(res => {
        if (res.ok) {
          return res.json();
        }
        throw new Error('Failed to fetch files');
      })
      .then(setFiles)
      .catch(e => {
        console.error(e);
        alert('提取失败');
      })
      .finally(() => setLoading(false));
  }, [prefix]);

  useEffect(fetchFiles, [fetchFiles]);

  // 新增 effect 用于获取存储使用情况
  useEffect(() => {
    const fetchStorageUsage = async () => {
      setIsLoadingUsage(true);
      try {
        const response = await fetch('/api/storage-usage');
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setStorageUsage(data.totalSize);
      } catch (error) {
        console.error('Failed to fetch storage usage:', error);
        setStorageUsage(null); // 出错时重置
      } finally {
        setIsLoadingUsage(false);
      }
    };

    fetchStorageUsage();
  }, []); // 空依赖数组，只在组件挂载时执行一次

  const handleUpload = useCallback(
    (files: FileList) => {
      if (files.length === 0) {
        return;
      }
      setUploading(true);
      setProgress(0);
      const file = files[0];
      const filename = prefix + file.name;
      fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          size: file.size,
        }),
      })
        .then(res => res.json())
        .then(async ({ url, key }) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', url);
          xhr.upload.onprogress = e => {
            setProgress((e.loaded / e.total) * 100);
          };
          xhr.onload = () => {
            if (xhr.status === 200) {
              fetch('/api/complete-upload', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ key }),
              }).then(() => {
                setUploading(false);
                setUploadDrawer(false);
                fetchFiles();
              });
            } else {
              setUploading(false);
              alert('Upload failed');
            }
          };
          xhr.send(file);
        });
    },
    [fetchFiles, prefix],
  );

  const handleCreateFolder = () => {
    if (newFolderName === '') {
      return;
    }
    const key = prefix + newFolderName + '/';
    fetch('/api/create-folder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key }),
    }).then(() => {
      setCreateFolderModal(false);
      setNewFolderName('');
      fetchFiles();
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    fetch('/api/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: selected.key }),
    }).then(() => {
      setDeleteModal(false);
      fetchFiles();
    });
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleRename = () => {
    if (!selected || newName === '') return;
    const newKey = prefix + newName;
    fetch('/api/rename', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ oldKey: selected.key, newKey }),
    }).then(() => {
      setRenameModal(false);
      fetchFiles();
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div onDragOver={handleDragOver} onDrop={handleDrop}>
        <AppBar position="sticky">
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              FlareDrive
            </Typography>
            <TextField
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'white',
                  '& fieldset': {
                    borderColor: 'white',
                  },
                  '&:hover fieldset': {
                    borderColor: 'white',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'white',
                  },
                },
                '& .MuiOutlinedInput-input': {
                  color: 'white',
                },
              }}
              variant="outlined"
              size="small"
              placeholder="搜索"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <IconButton color="inherit" onClick={fetchFiles}>
              <Refresh />
            </IconButton>
            <IconButton color="inherit" onClick={() => setCreateFolderModal(true)}>
              <CreateNewFolder />
            </IconButton>
            <IconButton color="inherit" onClick={() => setUploadDrawer(true)}>
              <UploadFile />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Container fluid>
          <Drawer anchor="bottom" open={uploadDrawer} onClose={() => setUploadDrawer(false)}>
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography variant="h6">上传文件</Typography>
              <Input type="file" onChange={e => handleUpload((e.target as HTMLInputElement).files!)} />
              {uploading && (
                <Box sx={{ width: '100%', mt: 2 }}>
                  <Typography>{Math.round(progress)}%</Typography>
                </Box>
              )}
            </Box>
          </Drawer>
          <Modal open={createFolderModal} onClose={() => setCreateFolderModal(false)}>
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 400,
                bgcolor: 'background.paper',
                border: '2px solid #000',
                boxShadow: 24,
                p: 4,
              }}
            >
              <Typography variant="h6">创建文件夹</Typography>
              <TextField
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleCreateFolder();
                  }
                }}
              />
              <Button onClick={handleCreateFolder}>创建</Button>
            </Box>
          </Modal>
          <Modal open={renameModal} onClose={() => setRenameModal(false)}>
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 400,
                bgcolor: 'background.paper',
                border: '2px solid #000',
                boxShadow: 24,
                p: 4,
              }}
            >
              <Typography variant="h6">重命名</Typography>
              <TextField
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleRename();
                  }
                }}
              />
              <Button onClick={handleRename}>确定</Button>
            </Box>
          </Modal>
          <Modal open={deleteModal} onClose={() => setDeleteModal(false)}>
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 400,
                bgcolor: 'background.paper',
                border: '2px solid #000',
                boxShadow: 24,
                p: 4,
              }}
            >
              <Typography variant="h6">确认删除</Typography>
              <Typography>{selected?.key}</Typography>
              <Button onClick={handleDelete}>删除</Button>
            </Box>
          </Modal>
          <Breadcrumbs value={path} setValue={setPath} />

          {/* 这里是新增的存储使用情况显示区域 */}
          <Box sx={{ my: 2, p: 1.5, backgroundColor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {isLoadingUsage
                ? '正在加载存储用量...'
                : storageUsage !== null
                ? `总用量: ${formatBytes(storageUsage)} / 10 GB (免费额度)`
                : '无法获取存储用量'}
            </Typography>
          </Box>

          <FileTable
            loading={loading}
            files={filteredFiles}
            prefix={prefix}
            onFileClick={(file: R2ObjectWithSize) => {
              if (file.key.endsWith('/')) {
                setPath(file.key.substring(0, file.key.length - 1).split('/'));
              } else {
                setSelected(file);
                setTextPad(true);
              }
            }}
            onFileMenuClick={(file: R2ObjectWithSize, el: HTMLElement) => {
              setSelected(file);
              setAnchorEl(el);
            }}
          />
          <Menu
            open={open}
            anchorEl={anchorEl}
            onClose={() => {
              setAnchorEl(null);
            }}
          >
            <MenuItem
              onClick={() => {
                window.open(`/${selected?.key}`, '_blank');
                setAnchorEl(null);
              }}
            >
              <ListItemIcon>
                <Download />
              </ListItemIcon>
              <ListItemText>下载</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                setRenameModal(true);
                setNewName(selected!.key.substring(prefix.length));
                setAnchorEl(null);
              }}
            >
              <ListItemIcon>
                <DriveFileRenameOutline />
              </ListItemIcon>
              <ListItemText>重命名</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                setDeleteModal(true);
                setAnchorEl(null);
              }}
            >
              <ListItemIcon>
                <Delete />
              </ListItemIcon>
              <ListItemText>删除</ListItemText>
            </MenuItem>
          </Menu>
          <TextPadDrawer
            open={textPad}
            onClose={() => {
              setTextPad(false);
            }}
            fileKey={selected?.key || ''}
          />
        </Container>
      </div>
    </ThemeProvider>
  );
}
