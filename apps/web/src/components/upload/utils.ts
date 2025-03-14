import axios from 'axios'

import { nanoid } from '@/lib/utils'

import type {
  FilePercent,
  InternalUploadFile,
  RcFile,
  UploadFile,
  UploadFileProps,
  UploadFileStatus,
} from './type'
import { listPropsInterface } from './type'

export function file2Obj(file: RcFile): InternalUploadFile {
  return {
    ...file,
    lastModified: file.lastModified,
    name: file.name,
    size: file.size,
    type: file.type,
    uid: file.uid,
    percent: 0,
    originFileObj: file,
  }
}

/** Upload fileList. Replace file if exist or just push into it. */
export function updateFileList(
  file: UploadFile,
  fileList: (UploadFile | Readonly<UploadFile>)[]
) {
  const nextFileList = [...fileList]
  const fileIndex = nextFileList.findIndex(({ uid }) => uid === file.uid)
  if (fileIndex === -1) {
    nextFileList.push(file)
  } else {
    nextFileList[fileIndex] = file
  }
  return nextFileList
}

export function getFileItem(
  file: RcFile,
  fileList: (UploadFile | Readonly<UploadFile>)[]
) {
  const matchKey = file.uid !== undefined ? 'uid' : 'name'
  return fileList.filter((item) => item[matchKey] === file[matchKey])[0]
}

export function removeFileItem(
  file: UploadFile,
  fileList: (UploadFile | Readonly<UploadFile>)[]
) {
  const matchKey = file.uid !== undefined ? 'uid' : 'name'
  const removed = fileList.filter((item) => item[matchKey] !== file[matchKey])
  if (removed.length === fileList.length) {
    return null
  }
  return removed
}

export const checkShowIcon = (listProps: boolean | listPropsInterface) => {
  if (typeof listProps === 'object') {
    return { show: true, ...listProps }
  } else {
    return { show: listProps }
  }
}

export const checkType = (file: UploadFile) => {
  if (file?.type !== 'application/pdf' || file?.url?.includes('.pdf')) {
    return 'isPDF'
  }
  return 'isImage'
}

export const getBase64 = (img: RcFile, callback: (url: string) => void) => {
  const reader = new FileReader()
  reader.addEventListener('load', () => callback(reader.result as string))
  reader.readAsDataURL(img)
}

export const handleSuccess = ({
  fileType,
  setMergedFileList,
  onChangeFileList,
}: {
  setMergedFileList?: (s: any) => void
  fileType?: string
  onChangeFileList?: (files: FileProps[]) => void
}) => {
  setMergedFileList?.((files: UploadFile[]) => {
    const success = files?.filter(
      (item) => item?.status === 'success' && item?.url
    )
    const data = success?.reduce((m: FileProps[], item: UploadFile) => {
      m.push({
        url: item?.url || '',
        uid: nanoid(),
        type: fileType || item?.type,
        name: item?.name,
      })
      return m
    }, [])
    onChangeFileList?.(data)
    return files
  })
}

const handelProcess = (file: UploadFile, setProcess?: any) => {
  // add dynamic process to file
  setProcess?.((allProcess: FilePercent[]) => {
    const processIndex =
      allProcess?.findIndex((item) => item?.uid === file?.uid) || 0
    if (processIndex !== -1) {
      const left = allProcess.slice(0, processIndex)
      const right = allProcess.slice(processIndex + 1)
      const updated = { uid: file?.uid, percent: file?.percent }
      const newProcess = [...left, updated, ...right]
      return newProcess
    } else {
      return [...allProcess, { uid: file?.uid, percent: file?.percent }]
    }
  })
}

export const uploadFile = async ({
  file,
  fileList,
  setMergedFileList,
  aborts,
  setProcess,
  onChangeFileList,
  setIsUploading,
  fileType,
}: UploadFileProps) => {
  setIsUploading(true)
  if (!file) return
  file.status = 'uploading'
  const filename = encodeURIComponent(file?.name || '')
  const res = await fetch(`/api/upload-url/gcp?filename=${filename}`)
  const { success, data } = await res.json()
  if (!success) {
    file.status = 'error'
    setIsUploading(false)
  }
  const { upload_url, upload_fields, file_url } = data as {
    provider: string
    upload_url: string
    upload_fields: { [key: string]: string }
    file_url: string
    file_path: string
  }
  const formData = new FormData()
  Object.entries({ ...upload_fields, file: file?.originFileObj }).forEach(
    ([key, value]) => {
      // @ts-ignore
      formData.append(key, value)
    }
  )
  const abort = new AbortController()
  aborts.current?.push({ uid: file?.uid, control: abort })
  const current = aborts?.current?.find((item) => item?.uid === file?.uid)
  axios
    .post(upload_url, formData, {
      signal: current?.control?.signal,
      onUploadProgress: async (progressEvent) => {
        const { progress = 0 } = progressEvent
        file.percent = progress * 100
        await handelProcess(file, setProcess)
      },
    })
    .then(async () => {
      file.status = 'success'
      file.url = file_url
      setIsUploading(false)
      handleSuccess({
        setMergedFileList,
        onChangeFileList,
        fileType,
      })
    })
    .catch(async (error) => {
      setIsUploading(false)
      file.status = 'error'
      console.error(error)
    })
}

export const stringUrlToFile = (url: string) => {
  const status: UploadFileStatus = 'success'
  return url
    ? [
        {
          url,
          name: '',
          uid: nanoid(),
          status,
        },
      ]
    : []
}

export type FileProps = {
  name: string
  url: string
  uid?: string
  type?: string
}
export const changeToUploadFile = (
  value: Array<FileProps | string> | string
) => {
  const isFiles = Array.isArray(value)
  if (isFiles) {
    const data = value?.reduce((m: UploadFile[], item: FileProps | string) => {
      const isImage = typeof item === 'string'
      const status: UploadFileStatus = 'success'
      const cur = isImage
        ? stringUrlToFile(item)[0]
        : { ...item, status, uid: nanoid() }
      m.push(cur)
      return m
    }, [])
    return data
  } else {
    return stringUrlToFile(value)
  }
}
