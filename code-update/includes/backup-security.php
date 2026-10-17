<?php
if(!defined('DATADIR')){http_response_code(403);exit;}
// Restore only missing regular data files. Never follow archive paths or symlinks outside local.
function motor_backup_restore(string $archive): void {
    $zip=new ZipArchive();if($zip->open($archive,ZipArchive::RDONLY)!==true)throw new RuntimeException('Архив повреждён.');
    try {
        if($zip->numFiles>50000)throw new RuntimeException('В архиве слишком много файлов.');
        $base=realpath(DATADIR);if(!$base)throw new RuntimeException('Каталог данных не найден.');
        $entries=[];$total=0;
        for($i=0;$i<$zip->numFiles;$i++) {
            $stat=$zip->statIndex($i);$name=$stat['name'];$parts=explode('/',rtrim($name,'/'));
            if(!$name||str_contains($name,'\\')||str_starts_with($name,'/')||str_contains($name,':')||preg_match('/[\x00-\x1f\x7f]/',$name))throw new RuntimeException('Недопустимый путь в архиве.');
            foreach($parts as $partIndex=>$part)if($part===''||(str_starts_with($part,'.') && !(in_array($part,['.htaccess','.gallery.lock','.attachments.lock','.chat.lock'],true) && $partIndex===count($parts)-1)))throw new RuntimeException('Недопустимый путь в архиве.');
            // Old Motor archives contain protective .htaccess files. Server policy is authoritative; never restore archive-supplied rules.
            if(in_array(end($parts),['.htaccess','.gallery.lock','.attachments.lock','.chat.lock'],true))continue;
            if(in_array($parts[0],['databackup','datatmp','datados'],true))throw new RuntimeException('Архив содержит служебный каталог.');
            $zip->getExternalAttributesIndex($i,$opsys,$attributes);
            if($opsys===ZipArchive::OPSYS_UNIX && (($attributes>>16)&0170000)===0120000)throw new RuntimeException('Символьные ссылки в архиве запрещены.');
            $total+=(int)$stat['size'];if($stat['size']>64*1048576||$total>1024*1048576)throw new RuntimeException('Архив превышает лимит восстановления (1 ГБ, 64 МБ на файл).');
            $walk=$base;foreach($parts as $part){$walk.='/'.$part;if(is_link($walk))throw new RuntimeException('Путь восстановления содержит символьную ссылку.');}
            $entries[]=[$name,$walk,str_ends_with($name,'/'),(int)$stat['size']];
        }
        // Validate every member before creating anything.
        if(disk_free_space($base)<$total+8388608)throw new RuntimeException('Недостаточно места для восстановления.');
        foreach($entries as [$name,$dest,$directory,$size]) {
            if(file_exists($dest))continue;
            if($directory){if(!is_dir($dest)&&!mkdir($dest,0700,true))throw new RuntimeException('Не удалось создать папку.');continue;}
            $parent=dirname($dest);if(!is_dir($parent)&&!mkdir($parent,0700,true))throw new RuntimeException('Не удалось создать папку.');
            $input=$zip->getStream($name);$tmp=$dest.'.'.bin2hex(random_bytes(16)).'.tmp';$output=fopen($tmp,'xb');
            if(!$input||!$output){if(is_resource($input))fclose($input);if(is_resource($output))fclose($output);@unlink($tmp);throw new RuntimeException('Не удалось прочитать файл архива.');}
            try {$copied=stream_copy_to_stream($input,$output,$size+1);if($copied!==$size)throw new RuntimeException('Файл архива повреждён.');}
            catch(Throwable $e){fclose($input);fclose($output);unlink($tmp);throw $e;}
            fclose($input);fclose($output);chmod($tmp,0600);
            if(!rename($tmp,$dest)){unlink($tmp);throw new RuntimeException('Не удалось восстановить файл.');}
        }
    }finally{$zip->close();}
}
