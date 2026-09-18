<?php
if (!defined('ABSPATH')) exit;
// Motor puro de validação de JSON-LD, portado de zica-ai/includes/class-zica-ai-schema-validator.php
// (validate_schema/validate_nested_schemas/$required_fields/$field_rules/is_valid_iso8601), lendo
// _zica_posts_json_ld em vez de _cfrdm_*. Acrescenta LegalService/Attorney/Organization ao legado.
final class Zica_Posts_Schema_Validator {
 private static $required_fields=array(
  'Article'=>array('required'=>array('@type','headline','datePublished','author'),'recommended'=>array('image','dateModified','publisher','description')),
  'TechArticle'=>array('required'=>array('@type','headline','datePublished','author'),'recommended'=>array('image','dateModified','publisher','description')),
  'Product'=>array('required'=>array('@type','name'),'recommended'=>array('image','description','brand','offers','aggregateRating','review')),
  'Review'=>array('required'=>array('@type','itemReviewed','reviewRating','author'),'recommended'=>array('datePublished','reviewBody','positiveNotes','negativeNotes')),
  'FAQPage'=>array('required'=>array('@type','mainEntity'),'recommended'=>array()),
  'Question'=>array('required'=>array('@type','name','acceptedAnswer'),'recommended'=>array()),
  'BreadcrumbList'=>array('required'=>array('@type','itemListElement'),'recommended'=>array()),
  'ImageObject'=>array('required'=>array('@type','contentUrl'),'recommended'=>array('name','description','width','height')),
  'ItemList'=>array('required'=>array('@type','itemListElement'),'recommended'=>array('name','numberOfItems')),
  'Offer'=>array('required'=>array('@type','price','priceCurrency'),'recommended'=>array('availability','url')),
  'AggregateRating'=>array('required'=>array('@type','ratingValue'),'recommended'=>array('bestRating','worstRating','ratingCount')),
  'HowTo'=>array('required'=>array('@type','name','step'),'recommended'=>array('description','image','totalTime','estimatedCost','supply','tool')),
  'HowToStep'=>array('required'=>array('@type','text'),'recommended'=>array('name','url','image')),
  'HowToSection'=>array('required'=>array('@type','name','itemListElement'),'recommended'=>array()),
  'Recipe'=>array('required'=>array('@type','name','recipeIngredient','recipeInstructions'),'recommended'=>array('image','author','datePublished','description','prepTime','cookTime','totalTime','nutrition')),
  'VideoObject'=>array('required'=>array('@type','name','description','thumbnailUrl','uploadDate'),'recommended'=>array('contentUrl','duration','embedUrl')),
  'LocalBusiness'=>array('required'=>array('@type','name','address'),'recommended'=>array('telephone','openingHours','geo','image','priceRange')),
  'LegalService'=>array('required'=>array('@type','name'),'recommended'=>array('areaServed','provider')),
  'Attorney'=>array('required'=>array('@type','name'),'recommended'=>array('memberOf')),
  'Organization'=>array('required'=>array('@type','name'),'recommended'=>array('url','logo')),
 );
 private static $field_rules=array(
  'headline'=>array('max_length'=>110,'min_length'=>10),
  'description'=>array('max_length'=>320,'min_length'=>50),
  'datePublished'=>array('format'=>'iso8601'),
  'dateModified'=>array('format'=>'iso8601'),
  'ratingValue'=>array('type'=>'numeric','min'=>0,'max'=>5),
  'price'=>array('type'=>'numeric','min'=>0),
 );
 public function validate_schema_endpoint($request){$p=$request->get_json_params();$p=is_array($p)?$p:array();if(!empty($p['post_id'])){$post_id=absint($p['post_id']);$schemas=get_post_meta($post_id,'_zica_posts_json_ld',true);if(!is_array($schemas)||!$schemas)return new WP_Error('zica_posts_no_schema','Nenhum schema encontrado para este post_id.',array('status'=>404));return rest_ensure_response($this->validate_all($schemas));}if(!empty($p['schema'])){$schema=$p['schema'];if(is_string($schema))$schema=json_decode($schema,true);return rest_ensure_response($this->validate_schema($schema));}return new WP_Error('zica_posts_missing_data','Forneça post_id ou schema para validar.',array('status'=>400));}
 private function validate_all($schemas){$results=array('valid'=>true,'errors'=>array(),'warnings'=>array(),'info'=>array(),'schemas_validated'=>count($schemas));foreach($schemas as $schema){$type=is_array($schema)&&isset($schema['@type'])?$schema['@type']:'unknown';$validation=$this->validate_schema($schema);if(!$validation['valid'])$results['valid']=false;foreach($validation['errors'] as $e)$results['errors'][]="[$type] $e";foreach($validation['warnings'] as $w)$results['warnings'][]="[$type] $w";foreach($validation['info'] as $i)$results['info'][]="[$type] $i";}return $results;}
 public function validate_schema($schema){$result=array('valid'=>true,'errors'=>array(),'warnings'=>array(),'info'=>array());if(!is_array($schema)){$result['valid']=false;$result['errors'][]='Schema deve ser um objeto válido.';return $result;}if(empty($schema['@context'])){$result['valid']=false;$result['errors'][]='@context é obrigatório.';}elseif('https://schema.org'!==$schema['@context']){$result['warnings'][]='@context deve ser "https://schema.org".';}if(empty($schema['@type'])){$result['valid']=false;$result['errors'][]='@type é obrigatório.';return $result;}$type=$schema['@type'];if(isset(self::$required_fields[$type])){$rules=self::$required_fields[$type];foreach($rules['required'] as $field){if('@type'===$field)continue;if(empty($schema[$field])){$result['valid']=false;$result['errors'][]=sprintf('Campo obrigatório "%s" está vazio ou ausente.',$field);}}foreach($rules['recommended'] as $field)if(empty($schema[$field]))$result['warnings'][]=sprintf('Campo recomendado "%s" está ausente. Adicionar pode melhorar rich results.',$field);}else{$result['info'][]=sprintf('Tipo "%s" não tem regras de validação definidas.',$type);}foreach(self::$field_rules as $field=>$rules){if(!isset($schema[$field]))continue;$value=$schema[$field];if(isset($rules['max_length'])&&is_string($value)&&strlen($value)>$rules['max_length'])$result['warnings'][]=sprintf('Campo "%s" excede %d caracteres (tem %d). Google pode truncar.',$field,$rules['max_length'],strlen($value));if(isset($rules['min_length'])&&is_string($value)&&strlen($value)<$rules['min_length'])$result['warnings'][]=sprintf('Campo "%s" tem menos de %d caracteres. Considere expandir.',$field,$rules['min_length']);if(isset($rules['format'])&&'iso8601'===$rules['format']&&!$this->is_valid_iso8601($value))$result['errors'][]=sprintf('Campo "%s" deve estar no formato ISO 8601 (ex: 2024-01-15T10:30:00+00:00).',$field);if(isset($rules['type'])&&'numeric'===$rules['type']){if(!is_numeric($value)){$result['errors'][]=sprintf('Campo "%s" deve ser numérico.',$field);}else{if(isset($rules['min'])&&$value<$rules['min'])$result['errors'][]=sprintf('Campo "%s" deve ser maior ou igual a %s.',$field,$rules['min']);if(isset($rules['max'])&&$value>$rules['max'])$result['errors'][]=sprintf('Campo "%s" deve ser menor ou igual a %s.',$field,$rules['max']);}}}$this->validate_nested_schemas($schema,$result);return $result;}
 private function validate_nested_schemas($schema,&$result){$nested_types=array('author','publisher','review','aggregateRating','offers','itemReviewed','acceptedAnswer','provider','memberOf');foreach($nested_types as $field){if(isset($schema[$field])&&is_array($schema[$field])&&isset($schema[$field]['@type'])){$nested_validation=$this->validate_schema($schema[$field]);foreach($nested_validation['errors'] as $e)$result['errors'][]="[$field] $e";foreach($nested_validation['warnings'] as $w)$result['warnings'][]="[$field] $w";}}}
 private function is_valid_iso8601($date){if(!is_string($date))return false;$patterns=array('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/','/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/','/^\d{4}-\d{2}-\d{2}$/');foreach($patterns as $pattern)if(preg_match($pattern,$date))return true;return false;}
}
