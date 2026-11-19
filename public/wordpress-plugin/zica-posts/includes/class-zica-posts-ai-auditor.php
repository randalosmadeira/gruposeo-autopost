<?php
if (!defined('ABSPATH')) exit;
// Agente.IA Auditor: checagens de leitura (robots.txt, arquivos de discovery, schema por
// artigo, schema de homepage, hreflang) acionáveis pelo plugin (admin-post) e via REST (GET /ai-audit).
final class Zica_Posts_AI_Auditor {
 private $discovery;
 public function __construct($discovery){$this->discovery=$discovery;}
 const SCHEMA_CACHE_KEY='zica_posts_audit_schema_cache';
 const SCHEMA_CACHE_TTL=21600;
 const ORG_TYPES=array('Organization','LegalService','LocalBusiness','NewsMediaOrganization');
 const ARTICLE_TYPES=array('Article','NewsArticle','BlogPosting');
 // $force=true (botão "Rodar Auditor de IA Agora") ignora e renova o cache de 6 h das checagens de schema,
 // que fazem requisições HTTP à homepage e a até 6 artigos.
 public function run_audit($force=false){$schema=$this->schema_checks((bool) $force);$checks=array($this->check_robots(),$this->check_discovery_files(),$schema['article'],$schema['homepage'],$this->check_hreflang());return array('score'=>$this->score_from_checks($checks),'checks'=>$checks,'generated_at'=>(new DateTimeImmutable('now',new DateTimeZone(ZICA_POSTS_TZ)))->format(DateTime::ATOM));}
 private function score_from_checks($checks){$weights=array('pass'=>1,'info'=>0.85,'warn'=>0.5,'fail'=>0);$max=count($checks)?:1;$total=0;foreach($checks as $c)$total+=isset($weights[$c['status']])?$weights[$c['status']]:0.5;return (int) round(100*$total/$max);}
 private function bot_blocked($bot,$content){return (bool) preg_match('/User-agent:\s*'.preg_quote($bot,'/').'\s*\n(?:.*\n)*?\s*Disallow:\s*\/\s*$/im',$content);}
 private function check_robots(){$response=wp_remote_get(home_url('/robots.txt'),array('timeout'=>10));if(is_wp_error($response))return array('id'=>'robots_txt','label'=>'robots.txt permite bots de IA','status'=>'warn','detail'=>'Não foi possível buscar robots.txt: '.$response->get_error_message());$content=(string) wp_remote_retrieve_body($response);$bots=$this->discovery->ai_bots();$blocked=array();foreach($bots as $bot)if($this->bot_blocked($bot,$content))$blocked[]=$bot;$ok=count($bots)-count($blocked);$status=$blocked?($ok>0?'warn':'fail'):'pass';$detail=$ok.'/'.count($bots).' bots de IA liberados no robots.txt.'.($blocked?' Bloqueados: '.implode(', ',$blocked).'.':'');return array('id'=>'robots_txt','label'=>'robots.txt permite bots de IA','status'=>$status,'detail'=>$detail);}
 private function check_discovery_files(){$status=get_option('zica_posts_discovery_files_status',array());$expected=array('llms.txt','llms-full.txt','ai.txt','zica-ai-manifest.json','zica-ai-sitemap.xml');$missing=array();foreach($expected as $name)if(!isset($status[$name]))$missing[]=$name;$physical='1'===(string) get_option('zica_posts_physical_files_enabled','1');$age_h=null;$stale=(bool) $missing;if($physical&&!$missing){$newest=0;foreach($expected as $name){$path=ABSPATH.$name;if(file_exists($path))$newest=max($newest,filemtime($path));}if($newest){$age_h=round((time()-$newest)/3600,1);$stale=$age_h>24;}else{$stale=true;}}if($missing||$stale){if(method_exists($this->discovery,'schedule_refresh'))$this->discovery->schedule_refresh(0);$level=$missing?'fail':'warn';$detail=$missing?('Arquivos ausentes: '.implode(', ',$missing).'.'):('Arquivos desatualizados há '.$age_h.'h; atualização agendada.');}else{$level='pass';$detail=$physical?('Arquivos atualizados há '.$age_h.'h.'):'Modo de arquivo virtual ativo (conteúdo sempre atual na entrega).';}return array('id'=>'discovery_files','label'=>'llms.txt / llms-full.txt / ai.txt / manifest / sitemap','status'=>$level,'detail'=>$detail);}
 private function schema_checks($force){
  if($force){delete_transient(self::SCHEMA_CACHE_KEY);}else{$cached=get_transient(self::SCHEMA_CACHE_KEY);if(is_array($cached)&&isset($cached['article'],$cached['homepage'])&&is_array($cached['article'])&&is_array($cached['homepage']))return $cached;}
  $fresh=array('article'=>$this->check_article_schema(),'homepage'=>$this->check_homepage_schema());
  $cache=true;foreach($fresh as $k=>$c){if(isset($c['_nocache'])){$cache=false;unset($fresh[$k]['_nocache']);}}
  if($cache)set_transient(self::SCHEMA_CACHE_KEY,$fresh,self::SCHEMA_CACHE_TTL);
  return $fresh;
 }
 // Busca o HTML renderizado de uma URL do próprio site. Retorna array(ok,html,error).
 private function fetch_html($url,$timeout){
  $r=wp_remote_get($url,array('timeout'=>$timeout,'redirection'=>3,'sslverify'=>true,'limit_response_size'=>2097152,'headers'=>array('Accept'=>'text/html')));
  if(is_wp_error($r))return array('ok'=>false,'html'=>'','error'=>$r->get_error_message());
  $code=(int) wp_remote_retrieve_response_code($r);
  if($code<200||$code>=300)return array('ok'=>false,'html'=>'','error'=>'HTTP '.$code);
  return array('ok'=>true,'html'=>(string) wp_remote_retrieve_body($r),'error'=>'');
 }
 private static function filled($v){if(is_string($v))return trim($v)!=='';if(is_array($v))return count($v)>0;return $v!==null&&$v!==false;}
 // Tipos do nó JSON-LD (string ou array), sem prefixo de namespace ("schema:Organization", URL completa).
 public static function schema_types($node){
  $t=(is_array($node)&&isset($node['@type']))?$node['@type']:array();$t=is_array($t)?$t:array($t);$out=array();
  foreach($t as $v)if(is_string($v)&&trim($v)!=='')$out[]=preg_replace('~^.*[/:#]~','',trim($v));
  return $out;
 }
 // Lê todos os <script type="application/ld+json"> do HTML, ignora blocos inválidos e achata @graph.
 // Retorna array('nodes'=>nós com @type,'blocks'=>blocos válidos,'invalid'=>blocos ignorados,'rank_math'=>bool).
 public static function parse_schema_html($html){
  $res=array('nodes'=>array(),'blocks'=>0,'invalid'=>0,'rank_math'=>false);
  if(!is_string($html)||$html==='')return $res;
  $res['rank_math']=stripos($html,'rank-math-schema')!==false;
  if(!preg_match_all('~<script\b[^>]*\btype\s*=\s*(["\'])application/ld\+json\1[^>]*>(.*?)</script>~is',$html,$m))return $res;
  foreach($m[2] as $raw){
   $raw=preg_replace('~^\s*(?://\s*)?<!\[CDATA\[|(?://\s*)?\]\]>\s*$~','',trim($raw));
   $raw=trim(preg_replace('~^\xEF\xBB\xBF~','',$raw));
   $data=$raw===''?null:json_decode($raw,true);
   if(!is_array($data)){$res['invalid']++;continue;}
   $res['blocks']++;
   self::flatten_schema($data,$res['nodes'],0);
  }
  return $res;
 }
 private static function flatten_schema($data,&$out,$depth){
  if($depth>4||count($out)>=200||!is_array($data))return;
  if(isset($data['@graph'])&&is_array($data['@graph'])){foreach($data['@graph'] as $item)self::flatten_schema($item,$out,$depth+1);if(!isset($data['@type']))return;}
  if(isset($data['@type'])){$out[]=$data;return;}
  foreach($data as $item)if(is_array($item))self::flatten_schema($item,$out,$depth+1);
 }
 public static function has_article_node($nodes){
  foreach((array) $nodes as $n)if(array_intersect(self::schema_types($n),self::ARTICLE_TYPES))return true;
  return false;
 }
 // Avalia os nós da homepage. Nós Organization-like com o MESMO @id são fundidos (o schema do site e o nó
 // injetado pelo plugin descrevem a mesma entidade). Retorna array(status,org,type,name,missing,same_count,candidates).
 public static function evaluate_homepage_nodes($nodes){
  $merged=array();$anon=0;
  foreach((array) $nodes as $n){
   $types=self::schema_types($n);if(!array_intersect($types,self::ORG_TYPES))continue;
   $key=(isset($n['@id'])&&is_string($n['@id'])&&trim($n['@id'])!=='')?$n['@id']:'anon'.(++$anon);
   if(!isset($merged[$key]))$merged[$key]=array('_types'=>array());
   $merged[$key]['_types']=array_values(array_unique(array_merge($merged[$key]['_types'],$types)));
   foreach($n as $k=>$v)if($k!=='@type'&&self::filled($v)&&!(isset($merged[$key][$k])&&self::filled($merged[$key][$k])))$merged[$key][$k]=$v;
  }
  $best=null;$best_score=-1000;$best_missing=array();$best_notes=array();$best_present=array();
  foreach($merged as $o){
   if(!(isset($o['name'])&&is_string($o['name'])&&trim($o['name'])!==''&&isset($o['url'])&&is_string($o['url'])&&trim($o['url'])!==''))continue;
   $has_addr=self::filled(isset($o['address'])?$o['address']:null);
   if(!$has_addr&&isset($o['location'])&&is_array($o['location'])){$locs=isset($o['location']['address'])?array($o['location']):$o['location'];foreach($locs as $l)if(is_array($l)&&self::filled(isset($l['address'])?$l['address']:null)){$has_addr=true;break;}}
   $has_tel=self::filled(isset($o['telephone'])?$o['telephone']:null);
   if(!$has_tel&&isset($o['contactPoint'])&&is_array($o['contactPoint'])){$cps=isset($o['contactPoint']['telephone'])?array($o['contactPoint']):$o['contactPoint'];foreach($cps as $c)if(is_array($c)&&self::filled(isset($c['telephone'])?$c['telephone']:null)){$has_tel=true;break;}}
   $has_same=self::filled(isset($o['sameAs'])?$o['sameAs']:null);
   // sameAs é exigido de qualquer tipo; endereço e telefone só de LegalService/LocalBusiness (nó fundido).
   // Para Organization/NewsMediaOrganization a ausência deles vira apenas informação (notes), sem mudar o status.
   $local=(bool) array_intersect($o['_types'],array('LegalService','LocalBusiness'));
   $missing=array();$notes=array();$present=array();
   if($has_addr)$present[]='endereço';else{if($local)$missing[]='endereço (address)';else $notes[]='endereço (address)';}
   if($has_tel)$present[]='telefone';else{if($local)$missing[]='telefone (telephone)';else $notes[]='telefone (telephone)';}
   if($has_same)$present[]='sameAs';else $missing[]='sameAs';
   $score=-10*count($missing)-count($notes);
   if($score>$best_score){$best_score=$score;$best=$o;$best_missing=$missing;$best_notes=$notes;$best_present=$present;}
  }
  if($best===null)return array('status'=>'warn','org'=>false,'type'=>'','name'=>'','missing'=>array(),'notes'=>array(),'present'=>array(),'same_count'=>0,'candidates'=>count($merged));
  $type='';foreach($best['_types'] as $t)if(in_array($t,self::ORG_TYPES,true)){if($type===''||$type==='Organization')$type=$t;}
  $same=isset($best['sameAs'])?(is_array($best['sameAs'])?count($best['sameAs']):1):0;
  return array('status'=>$best_missing?'warn':'pass','org'=>true,'type'=>$type,'name'=>trim($best['name']),'missing'=>$best_missing,'notes'=>$best_notes,'present'=>$best_present,'same_count'=>$same,'candidates'=>count($merged));
 }
 private static function list_pt($items){$n=count($items);if($n<2)return implode('',$items);return implode(', ',array_slice($items,0,$n-1)).' e '.$items[$n-1];}
 private function check_article_schema(){
  $label='Schema JSON-LD nos artigos';
  $q=new WP_Query(array('post_type'=>'post','post_status'=>'publish','posts_per_page'=>6,'orderby'=>'date','order'=>'DESC','fields'=>'ids','no_found_rows'=>true));
  $ids=$q->posts;$total=count($ids);
  if(!$total)return array('id'=>'article_schema','label'=>$label,'status'=>'info','detail'=>'Nenhum artigo publicado para avaliar.');
  $plugin=0;$rank_math=0;$theme=0;$errors=0;$attempts=0;$skipped=0;
  foreach($ids as $id){
   $stored=get_post_meta($id,'_zica_posts_json_ld',true);
   if(is_array($stored)&&$stored){$plugin++;continue;}
   if($errors>=2){$skipped++;continue;}
   $attempts++;$page=$this->fetch_html((string) get_permalink($id),6);
   if(!$page['ok']){$errors++;continue;}
   $parsed=self::parse_schema_html($page['html']);
   if(self::has_article_node($parsed['nodes'])){if($parsed['rank_math'])$rank_math++;else $theme++;}
  }
  $with=$plugin+$rank_math+$theme;$unread=$errors+$skipped;
  $detail=$with.'/'.$total.' artigos amostrados têm schema estruturado (plugin '.$plugin.', Rank Math '.$rank_math.', tema/outro '.$theme.').';
  $result=array('id'=>'article_schema','label'=>$label);
  if($unread){$detail.=' '.$unread.' página(s) não puderam ser lidas.';$result['_nocache']=true;}
  if($with===0&&$attempts>0&&$errors===$attempts)$status='warn';
  else{$ratio=$with/$total;$status=$ratio>=0.9?'pass':($ratio>0?'warn':'fail');}
  $result['status']=$status;$result['detail']=$detail;
  return $result;
 }
 private function check_homepage_schema(){
  $label='Schema JSON-LD da homepage';
  $opt=get_option('zica_posts_homepage_schema',array());$plugin_n=is_array($opt)?count(array_filter($opt,'is_array')):0;
  $suffix=' Schema do plugin: '.$plugin_n.'.';
  $page=$this->fetch_html(home_url('/'),8);
  if(!$page['ok']){
   $detail='Não foi possível ler a homepage renderizada ('.$page['error'].').'.($plugin_n?' O plugin tem '.$plugin_n.' schema(s) configurado(s) e o imprime na home, mas a presença não foi verificada.':' O plugin não tem schema de homepage configurado.');
   return array('id'=>'homepage_schema','label'=>$label,'status'=>$plugin_n?'info':'warn','detail'=>$detail,'_nocache'=>true);
  }
  $parsed=self::parse_schema_html($page['html']);
  $ev=self::evaluate_homepage_nodes($parsed['nodes']);
  if(!$ev['org']){
   $detail='A homepage renderizada não tem nó Organization/LegalService/LocalBusiness/NewsMediaOrganization com name e url ('.$parsed['blocks'].' bloco(s) JSON-LD lido(s)'.($parsed['invalid']?', '.$parsed['invalid'].' inválido(s) ignorado(s)':'').').'.$suffix;
   return array('id'=>'homepage_schema','label'=>$label,'status'=>'warn','detail'=>$detail);
  }
  if($ev['missing']){
   $items=array();foreach($ev['missing'] as $m)$items[]='sem '.$m;
   $detail='A homepage tem '.$ev['type'].' "'.$ev['name'].'", mas '.self::list_pt($items).'.';
  }else{
   $detail='A homepage publica '.$ev['type'].' "'.$ev['name'].'" com '.self::list_pt($ev['present']).' ('.$ev['same_count'].' perfil(is) em sameAs).';
  }
  if(!empty($ev['notes'])){$items=array();foreach($ev['notes'] as $n)$items[]='sem '.$n;$detail.=' Informativo: '.self::list_pt($items).' (opcional para '.$ev['type'].').';}
  $detail.=$suffix;
  return array('id'=>'homepage_schema','label'=>$label,'status'=>$ev['status'],'detail'=>$detail);
 }
 private function check_hreflang(){global $wpdb;$count=(int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} WHERE meta_key=%s AND meta_value<>'' AND meta_value<>'a:0:{}'",'_zica_posts_hreflang_map'));if(!$count)return array('id'=>'hreflang','label'=>'hreflang entre traduções','status'=>'info','detail'=>'Nenhum artigo com mapa de hreflang configurado — normal em site de idioma único.');return array('id'=>'hreflang','label'=>'hreflang entre traduções','status'=>'pass','detail'=>$count.' artigo(s) com mapa de hreflang configurado.');}
}
