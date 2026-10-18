<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}
function motor_arcade_escape(string $s): string {return htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
function motor_arcade_symbol(int $n): string {
    $names=['Вишни','Апельсин','Виноград','Бананы','Яблоко','BAR','Семёрка','Чатлы'];
    $art=[
        '<path d="M25 49Q35 20 49 12M52 52L49 12" fill="none" stroke="#3c7d4f" stroke-width="5"/><ellipse cx="59" cy="19" rx="13" ry="6" fill="#599d57" transform="rotate(30 59 19)"/><circle cx="24" cy="55" r="16" fill="#c92449"/><circle cx="54" cy="57" r="16" fill="#e4445b"/><circle cx="19" cy="49" r="4" fill="#ffb0aa"/><circle cx="49" cy="51" r="4" fill="#ffc4ba"/>',
        '<path d="M40 21L43 8" stroke="#6d4928" stroke-width="5"/><ellipse cx="54" cy="16" rx="14" ry="7" fill="#4c914a" transform="rotate(-20 54 16)"/><circle cx="40" cy="47" r="26" fill="#ec8c22"/><path d="M23 38Q27 28 37 28" fill="none" stroke="#ffe19c" stroke-width="5" stroke-linecap="round"/>',
        '<path d="M40 20L46 7" stroke="#6b4a27" stroke-width="5"/><path d="M42 18Q15 1 13 24Q29 28 42 18" fill="#5b9856"/><g fill="#7b4ac0" stroke="#5e3396" stroke-width="1.5"><circle cx="29" cy="30" r="12"/><circle cx="51" cy="30" r="12"/><circle cx="22" cy="46" r="12"/><circle cx="42" cy="46" r="12"/><circle cx="60" cy="46" r="12"/><circle cx="32" cy="61" r="12"/><circle cx="51" cy="61" r="12"/><circle cx="42" cy="72" r="8"/></g>',
        '<path d="M14 19Q12 62 56 64Q71 64 74 52Q49 57 32 34L22 13Z" fill="#f2ba28" stroke="#a97a1b" stroke-width="2"/><path d="M22 17Q22 56 62 59Q43 70 26 56Q10 44 14 19" fill="#ffe066"/><path d="M14 19L18 9L25 14" fill="#775328"/>',
        '<path d="M40 25Q39 10 46 7" fill="none" stroke="#694629" stroke-width="5"/><ellipse cx="55" cy="17" rx="13" ry="6" fill="#57954b" transform="rotate(-24 55 17)"/><path d="M40 28C10 10 4 49 23 69Q32 77 40 70Q48 77 58 69C78 43 65 11 40 28Z" fill="#d94149"/><path d="M23 34Q17 39 20 48" stroke="#ffb6a8" fill="none" stroke-width="5" stroke-linecap="round"/>',
        '<rect x="5" y="20" width="70" height="40" rx="8" fill="#23394c"/><rect x="9" y="24" width="62" height="32" rx="5" fill="none" stroke="#edc783" stroke-width="2"/><text x="40" y="48" text-anchor="middle" fill="#fff6da" font-family="Arial,sans-serif" font-weight="900" font-size="24">BAR</text>',
        '<text x="41" y="66" text-anchor="middle" fill="#c43e47" stroke="#f3c46d" stroke-width="2" font-family="Georgia,serif" font-weight="900" font-size="72">7</text>',
        '<circle cx="40" cy="40" r="31" fill="#e6b95d" stroke="#aa7831" stroke-width="3"/><circle cx="40" cy="40" r="25" fill="none" stroke="#fff0b9" stroke-width="2"/><text x="40" y="58" text-anchor="middle" fill="#725022" font-family="Georgia,serif" font-weight="bold" font-size="48">$</text>'
    ];
    return '<svg viewBox="0 0 80 80" role="img" aria-label="'.$names[$n-1].'">'.$art[$n-1].'</svg>';
}
function motor_arcade_die(int $n): string {
    $dots=[1=>[[40,40]],2=>[[22,22],[58,58]],3=>[[22,22],[40,40],[58,58]],4=>[[22,22],[58,22],[22,58],[58,58]],5=>[[22,22],[58,22],[40,40],[22,58],[58,58]],6=>[[22,20],[58,20],[22,40],[58,40],[22,60],[58,60]]];
    $svg='<svg class="arcade-die" viewBox="0 0 80 80" role="img" aria-label="Кость: '.$n.'"><rect x="2" y="2" width="76" height="76" rx="14" fill="#fffaf0" stroke="#cfbc94" stroke-width="2"/>';
    foreach($dots[$n] as [$x,$y])$svg.='<circle cx="'.$x.'" cy="'.$y.'" r="6" fill="#283c4d"/>';
    return $svg.'</svg>';
}
function motor_arcade_cup(bool $ball,bool $reveal): string {
    return '<span class="arcade-cup-scene'.($reveal?' is-open':'').'"><svg class="arcade-cup" viewBox="0 0 100 110" aria-hidden="true"><path d="M24 19Q50 9 76 19L88 92Q50 106 12 92Z" fill="#ca8850" stroke="#734e35" stroke-width="3"/><path d="M30 24L22 88M42 23L39 92M56 23L59 92M69 25L77 88" stroke="#eeb881" stroke-width="5" opacity=".8"/><ellipse cx="50" cy="20" rx="26" ry="8" fill="#edbc88" stroke="#825a3b" stroke-width="3"/><ellipse cx="50" cy="92" rx="38" ry="9" fill="#805637"/></svg>'.($ball?'<span class="arcade-ball" aria-hidden="true"></span>':'').'</span>';
}
function motor_arcade_form(string $id,array $s,array $settings): string {
    return '<form class="legacy-action" method="post" action="'.$id.'.php" data-arcade-form><input type="hidden" name="uid" value="'.motor_arcade_escape($_SESSION['token']).'"><input type="hidden" name="command" value="play"><input type="hidden" name="revision" value="'.motor_arcade_escape($s['revision']).'"><input type="hidden" name="rules_revision" value="'.motor_arcade_version($settings).'">';
}
function motor_arcade_view(string $id,array $snap,array $settings,string $message='',bool $fresh=false): string {
    $s=$snap['state'];$last=$s['games'][$id]??null;$r=$fresh?null:$last;$policy=$settings[$id];$balance=$snap['balance'];$can=$balance>=$policy['cost'];$won=($r['status']??'')==='won';
    ob_start(); ?>
    <div data-arcade-content data-revision="<?=motor_arcade_escape($s['revision'])?>" data-phase="<?=$r?'result':'ready'?>">
      <div class="g21-wallet"><span>Ваш баланс<strong><?=moneys($balance)?></strong></span><span class="g21-limit">Новая игра<strong><?=moneys($policy['cost'])?></strong></span></div>
      <p class="arcade-policy" data-game-policy><?=motor_arcade_escape(motor_arcade_policy_label($policy))?></p>
      <?php if($message!==''):?><p class="g21-notice" role="status"><?=motor_arcade_escape($message)?></p><?php endif;?>
      <div class="arcade-table arcade-<?=$id?>">
        <div class="arcade-caption"><span><?=$id==='bandit'?'ВОСЕМЬ ЛИНИЙ УДАЧИ':($id==='kosti'?'ДВА БРОСКА. ОДИН ПОБЕДИТЕЛЬ.':'ТРИ НАПЁРСТКА. ОДИН ШАРИК.')?></span><b aria-hidden="true">✦</b></div>
        <?php if($id==='bandit'):
            $grid=$r['grid']??[1,2,3,6,7,8,4,5,1];$score=$r?motor_arcade_slot_score($grid,$r['cost']):['lines'=>[]];$marked=[];foreach($score['lines'] as $line)$marked=array_merge($marked,$line['cells']);?>
          <div class="arcade-reels" aria-label="Игровые символы"><?php foreach($grid as $i=>$n):?><div class="arcade-cell<?=in_array($i,$marked,true)?' is-winning':''?>"><?=motor_arcade_symbol($n)?></div><?php endforeach;?></div>
        <?php elseif($id==='kosti'):$dice=$r['dice']??[3,4,2,5];?>
          <div class="arcade-dice-hand"><div><span>Банкир</span><strong><?=$r?$dice[2]+$dice[3]:'—'?></strong></div><div><?=motor_arcade_die($dice[2]).motor_arcade_die($dice[3])?></div></div>
          <div class="arcade-vs" aria-hidden="true">· · ·</div>
          <div class="arcade-dice-hand arcade-dice-you"><div><span>Ваш бросок</span><strong><?=$r?$dice[0]+$dice[1]:'—'?></strong></div><div><?=motor_arcade_die($dice[0]).motor_arcade_die($dice[1])?></div></div>
        <?php else:?>
          <?php if(!$r)echo motor_arcade_form($id,$s,$settings);?>
          <div class="arcade-cups" aria-label="Выбор напёрстка">
          <?php for($i=1;$i<=3;$i++):?>
            <?php if(!$r):?><button type="submit" name="choice" value="<?=$i?>" class="arcade-cup-button" aria-label="Выбрать напёрсток <?=$i?>"<?=$can?'':' disabled'?>><?=motor_arcade_cup(false,false)?><span>№ <?=$i?></span></button>
            <?php else:?><div class="arcade-cup-result<?=$r['choice']===$i?' is-chosen':''?>" role="img" aria-label="Напёрсток <?=$i?><?=$r['choice']===$i?', ваш выбор':''?><?=$r['ball']===$i?', шарик здесь':', пусто'?>"><?=motor_arcade_cup($r['ball']===$i,true)?><span>№ <?=$i?><?=$r['choice']===$i?' · ваш':''?></span></div><?php endif;?>
          <?php endfor;?></div><?php if(!$r)echo '</form>'; ?>
        <?php endif;?>
        <div class="arcade-outcome" tabindex="-1" data-arcade-status>
          <h2><?=$r?($won?'Вы выиграли!':($r['status']==='draw'?'Ставка возвращена':'В этот раз без выигрыша')):($id==='bandit'?'Поймайте свою комбинацию':($id==='kosti'?'Кто бросит больше?':'Где спрятался шарик?'))?></h2>
          <p><?php if($r):?><?=$r['status']==='won'?'+'.moneys($r['payout']-$r['cost']).' к балансу':($r['status']==='draw'?'Баланс не изменился':'−'.moneys($r['cost']-$r['payout']))?><?php else:?><?=$id==='bandit'?'Три одинаковых символа на линии приносят выплату.':($id==='kosti'?'Две кости у вас и две у банкира. Сравниваем суммы.':'Нажмите на один из напёрстков, чтобы сыграть.')?><?php endif;?></p>
          <?php if($r):?><small>Стоимость: <?=moneys($r['cost'])?> · Зачислено: <?=moneys($r['payout'])?></small><?php endif;?>
        </div>
      </div>
      <?php if($r && $id==='bandit' && $score['lines']):?><div class="arcade-lines"><?php foreach($score['lines'] as $line):?><span><?=motor_arcade_escape($line['name'])?> <b><?=moneys($line['payout'])?></b></span><?php endforeach;?></div><?php endif;?>
      <div class="g21-controls">
        <?php if($id!=='naperstki'):?><?=motor_arcade_form($id,$s,$settings)?><button class="g21-primary arcade-play" type="submit"<?=$can?'':' disabled'?>><?=$id==='bandit'?($r?'Крутить ещё':'Крутить барабаны'):($r?'Бросить ещё':'Бросить кости')?> · <?=$policy['cost']?></button></form>
        <?php elseif($r):?><a class="g21-primary arcade-play" href="naperstki.php?new=1" data-arcade-new>Новая партия →</a><?php endif;?>
        <p class="g21-hint"><?=$can?'Играем на чатлы — внутреннюю валюту сайта.':'Для игры не хватает чатлов на балансе.'?></p>
        <?php if($r && $r['policy']!==$policy):?><p class="g21-hint">Прошлая партия: <?=motor_arcade_escape(motor_arcade_policy_label($r['policy']))?>. Выше показаны условия новой партии.</p><?php endif;?>
      </div>
      <div class="g21-record"><span>Партий <strong><?=$last['rounds']??0?></strong></span><span>Побед <strong><?=$last['wins']??0?></strong></span></div>
      <?php if($id==='bandit'):?><details class="g21-rules"><summary>Выплаты по линиям <span aria-hidden="true">+</span></summary><p>Выплаты складываются. Стоимость одного вращения списывается один раз. В таблице указано зачисление, включая возвращаемую часть ставки; чистый выигрыш — зачисление минус стоимость.</p><div class="arcade-paytable" tabindex="0" role="region" aria-label="Таблица выплат, прокручивается горизонтально"><table><thead><tr><th>Линия</th><?php for($n=1;$n<=8;$n++)echo '<th>'.motor_arcade_symbol($n).'</th>';?></tr></thead><tbody><?php foreach(motor_arcade_slot_lines() as [$name,$cells,$pays]):?><tr><th><?=motor_arcade_escape($name)?></th><?php foreach($pays as $pay)echo '<td>'.intdiv($pay*$policy['cost'],5).'</td>';?></tr><?php endforeach;?></tbody></table></div></details><?php endif;?>
    </div>
    <?php return ob_get_clean();
}
