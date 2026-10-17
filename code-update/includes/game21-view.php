<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }
function motor21_escape(string $s): string {return htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
function motor21_card(int $id,bool $hidden=false): string {
    if ($hidden) return '<div class="g21-card g21-card-back" role="img" aria-label="Закрытая карта"><span aria-hidden="true">21</span></div>';
    $r=intdiv($id-1,4);$s=($id-1)%4;$ranks=['6','7','8','9','10','В','Д','К','Т'];$names=['Шестёрка','Семёрка','Восьмёрка','Девятка','Десятка','Валет','Дама','Король','Туз'];$suits=['♠','♥','♣','♦'];$suitNames=['пики','черви','трефы','бубны'];
    return '<div class="g21-card'.($s%2?' g21-red':'').'" role="img" aria-label="'.$names[$r].', '.$suitNames[$s].', '.motor21_score([$id]).' очков"><span class="g21-corner" aria-hidden="true">'.$ranks[$r].'<i>'.$suits[$s].'</i></span><span class="g21-suit" aria-hidden="true">'.$suits[$s].'</span><span class="g21-corner g21-bottom" aria-hidden="true">'.$ranks[$r].'<i>'.$suits[$s].'</i></span></div>';
}
function motor21_form(array $s,string $command): string {
    return '<form method="post" action="21.php" data-g21-form><input type="hidden" name="uid" value="'.motor21_escape($_SESSION['token']).'"><input type="hidden" name="revision" value="'.motor21_escape($s['revision']).'"><input type="hidden" name="command" value="'.$command.'">';
}
function motor21_view(array $snapshot,int $max,string $message=''): string {
    $s=$snapshot['state'];$balance=$snapshot['balance'];$g=$s['game'];$playing=($g['status']??'')==='playing';$done=$g!==null&&!$playing;$won=($g['status']??'')==='won';$available=max(0,min($balance,$max));$bet=min($available,$g['bet']??min(10,$available));
    ob_start();
    ?>
    <div class="g21-content" data-g21-content data-revision="<?=motor21_escape($s['revision'])?>" data-phase="<?=$playing?'playing':($done?'finished':'ready')?>">
      <div class="g21-wallet"><span>Ваш баланс <strong><?=moneys($balance)?></strong></span><span class="g21-limit">Лимит ставки <strong><?=moneys($max)?></strong></span></div>
      <?php if($message!==''):?><p class="g21-notice" role="status"><?=motor21_escape($message)?></p><?php endif;?>
      <div class="g21-table">
        <div class="g21-seat"><span><span class="g21-avatar" aria-hidden="true">♠</span> Банкир</span><span class="g21-score"><?=$done?motor21_score($g['dealer']):'?'?><span> очков</span></span></div>
        <div class="g21-hand" aria-label="Карты банкира">
          <?php foreach($g['dealer']??[1,2] as $id)echo motor21_card($id,!$done);?>
        </div>
        <div class="g21-center" tabindex="-1" data-g21-status>
          <span class="g21-eyebrow"><?=$playing?'ВАШ ХОД':($done?'ПАРТИЯ ЗАВЕРШЕНА':'КЛАССИКА В НОВОМ ВИДЕ')?></span>
          <h2><?=$playing?'Ближе к 21':($done?($won?'Вы выиграли!':'Победа банкира'):'Сыграем в 21?')?></h2>
          <p><?php
          if($playing)echo 'Возьмите карту или откройте свою руку.';
          elseif($done){
              if(motor21_rank($g['player'])===0)echo 'Перебор — в этот раз не повезло.';
              elseif(motor21_rank($g['player'])===motor21_rank($g['dealer']))echo 'При равных очках выигрывает банкир.';
              elseif(motor21_rank($g['dealer'])===0)echo 'У банкира перебор. Хорошая партия!';
              else echo $won?'Ваша комбинация оказалась сильнее.':'У банкира более сильная комбинация.';
          }else echo 'Наберите больше банкира, но не больше 21.';
          ?></p>
          <?php if($g):?><span class="g21-pot"><?=$playing?'На кону ':($won?'Зачислено ':'Потеряна ставка ')?><?=moneys($g['bet']*($playing||$won?2:1))?></span><?php endif;?>
        </div>
        <div class="g21-hand g21-player" aria-label="Ваши карты">
          <?php if($g){foreach($g['player'] as $id)echo motor21_card($id);}else{echo motor21_card(17).motor21_card(34);}?>
        </div>
        <div class="g21-seat g21-you"><span>Вы<?=$g?'':' · пример руки'?></span><span class="g21-score" data-g21-score><?=$g?motor21_score($g['player']):21?><span> очков</span></span></div>
      </div>
      <div class="g21-controls">
      <?php if($playing):?>
        <div class="g21-action-row">
          <?=motor21_form($s,'hit')?><button type="submit" class="g21-primary" data-g21-focus="hit"><span aria-hidden="true">+</span> Взять карту</button></form>
          <?=motor21_form($s,'stand')?><button type="submit" class="g21-secondary" data-g21-focus="stand">Открыться</button></form>
        </div><p class="g21-hint">При 20, 21, двух тузах или переборе — автоматическое вскрытие.</p>
      <?php else:?>
        <?=motor21_form($s,'start')?>
          <div class="g21-bet-label"><label for="g21-bet">Ваша ставка, чатлы</label><span>от 1 до <?=$available?></span></div>
          <div class="g21-bet-row"><input id="g21-bet" name="bet" type="number" inputmode="numeric" min="1" max="<?=max(1,$available)?>" step="1" value="<?=max(1,$bet)?>" required<?=$available<1?' disabled':''?>><button type="submit" class="g21-primary"<?=$available<1?' disabled':''?>><?=$done?'Сыграть ещё':'Раздать карты'?> <span aria-hidden="true">→</span></button></div>
          <?php if($available>0):?><div class="g21-presets" aria-label="Быстрый выбор ставки" hidden data-g21-presets><?php foreach(array_unique([1,min(10,$available),min(50,$available),$available]) as $n):?><button type="button" data-g21-bet="<?=$n?>"><?=$n===$available?'Макс. · ':''?><?=$n?></button><?php endforeach;?></div><?php endif;?>
        </form>
        <?php if($available<1):?><p class="g21-hint"><?=$max<1?'Игра на ставки отключена администратором.':'Для новой партии нужен хотя бы 1 чатл на балансе.'?></p><?php endif;?>
      <?php endif;?>
      <?php if(motor21_legacy()!==null):?><?=motor21_form($s,'restore')?><p class="g21-hint">В прежней версии осталась незавершённая ставка. Её можно вернуть.</p><button type="submit" class="g21-secondary">Вернуть прежнюю ставку</button></form><?php endif;?>
      </div>
      <div class="g21-record"><span>Завершено партий <strong><?=$s['rounds']?></strong></span><span>Побед <strong><?=$s['wins']?></strong></span></div>
    </div>
    <?php return ob_get_clean();
}
