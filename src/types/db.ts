
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "assets": {
                  Row: {
                    "bucket": string,"bytes": number | null,"created_at": string,"height_px": number | null,"id": string,"kind": Database["public"]['Enums']["asset_kind"],"mime_type": string | null,"original_filename": string | null,"owner_id": string,"page_count": number | null,"page_size_mm": Json | null,"path": string,"sha256": string | null,"status": Database["public"]['Enums']["asset_status"],"validation": NonNullable<Json>,"width_px": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket"?: string,"bytes"?: number | null,"created_at"?: string,"height_px"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["asset_kind"],"mime_type"?: string | null,"original_filename"?: string | null,"owner_id": string,"page_count"?: number | null,"page_size_mm"?: Json | null,"path": string,"sha256"?: string | null,"status"?: Database["public"]['Enums']["asset_status"],"validation"?: NonNullable<Json>,"width_px"?: number | null
                  }
                  Update: {
                    "bucket"?: string,"bytes"?: number | null,"created_at"?: string,"height_px"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["asset_kind"],"mime_type"?: string | null,"original_filename"?: string | null,"owner_id"?: string,"page_count"?: number | null,"page_size_mm"?: Json | null,"path"?: string,"sha256"?: string | null,"status"?: Database["public"]['Enums']["asset_status"],"validation"?: NonNullable<Json>,"width_px"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"diff": NonNullable<Json>,"entity_id": string | null,"entity_type": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"diff"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"diff"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"designs": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"document": Json | null,"id": string,"is_locked": boolean,"name": string,"owner_id": string,"product_id": string,"source": Database["public"]['Enums']["design_source"],"template_id": string | null,"thumbnail_path": string | null,"updated_at": string,"upload_asset_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"document"?: Json | null,"id"?: string,"is_locked"?: boolean,"name"?: string,"owner_id": string,"product_id": string,"source"?: Database["public"]['Enums']["design_source"],"template_id"?: string | null,"thumbnail_path"?: string | null,"updated_at"?: string,"upload_asset_id"?: string | null
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"document"?: Json | null,"id"?: string,"is_locked"?: boolean,"name"?: string,"owner_id"?: string,"product_id"?: string,"source"?: Database["public"]['Enums']["design_source"],"template_id"?: string | null,"thumbnail_path"?: string | null,"updated_at"?: string,"upload_asset_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "designs_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "designs_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "designs_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "templates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "designs_upload_asset_id_fkey"
      columns: ["upload_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    }
                  ]
                },"discount_tiers": {
                  Row: {
                    "created_at": string,"id": string,"min_qty": number,"percent_off": number,"product_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"min_qty": number,"percent_off": number,"product_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"min_qty"?: number,"percent_off"?: number,"product_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "discount_tiers_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"divisions": {
                  Row: {
                    "created_at": string,"description": string | null,"hero_image_path": string | null,"id": string,"is_active": boolean,"name": string,"slug": string,"sort_order": number,"tagline": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"hero_image_path"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"slug": string,"sort_order"?: number,"tagline"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"hero_image_path"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"slug"?: string,"sort_order"?: number,"tagline"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"gallery_items": {
                  Row: {
                    "caption": string | null,"created_at": string,"division_id": string,"id": string,"image_path": string,"is_active": boolean,"is_sample": boolean,"sort_order": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"created_at"?: string,"division_id": string,"id"?: string,"image_path": string,"is_active"?: boolean,"is_sample"?: boolean,"sort_order"?: number,"title": string
                  }
                  Update: {
                    "caption"?: string | null,"created_at"?: string,"division_id"?: string,"id"?: string,"image_path"?: string,"is_active"?: boolean,"is_sample"?: boolean,"sort_order"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gallery_items_division_id_fkey"
      columns: ["division_id"]
isOneToOne: false
      referencedRelation: "divisions"
      referencedColumns: ["id"]
    }
                  ]
                },"materials": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"merge_jobs": {
                  Row: {
                    "created_at": string,"csv_asset_id": string,"dataset_hash": string | null,"finished_at": string | null,"id": string,"mapping": NonNullable<Json>,"order_id": string,"processed_count": number,"row_count": number,"row_issues": NonNullable<Json>,"rows": NonNullable<Json>,"started_at": string | null,"status": Database["public"]['Enums']["merge_status"],"updated_at": string,"zip_path": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"csv_asset_id": string,"dataset_hash"?: string | null,"finished_at"?: string | null,"id"?: string,"mapping"?: NonNullable<Json>,"order_id": string,"processed_count"?: number,"row_count"?: number,"row_issues"?: NonNullable<Json>,"rows"?: NonNullable<Json>,"started_at"?: string | null,"status"?: Database["public"]['Enums']["merge_status"],"updated_at"?: string,"zip_path"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"csv_asset_id"?: string,"dataset_hash"?: string | null,"finished_at"?: string | null,"id"?: string,"mapping"?: NonNullable<Json>,"order_id"?: string,"processed_count"?: number,"row_count"?: number,"row_issues"?: NonNullable<Json>,"rows"?: NonNullable<Json>,"started_at"?: string | null,"status"?: Database["public"]['Enums']["merge_status"],"updated_at"?: string,"zip_path"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "merge_jobs_csv_asset_id_fkey"
      columns: ["csv_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "merge_jobs_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"error": string | null,"id": string,"order_id": string | null,"provider_message_id": string | null,"read_at": string | null,"status": Database["public"]['Enums']["notification_status"],"subject": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"channel": Database["public"]['Enums']["notification_channel"],"created_at"?: string,"error"?: string | null,"id"?: string,"order_id"?: string | null,"provider_message_id"?: string | null,"read_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"subject": string,"type": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"error"?: string | null,"id"?: string,"order_id"?: string | null,"provider_message_id"?: string | null,"read_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"subject"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "config_snapshot": NonNullable<Json>,"created_at": string,"description": string,"design_id": string | null,"design_snapshot": Json | null,"discount_percent": number,"id": string,"is_variable_data": boolean,"line_gross_minor": number,"line_net_minor": number,"line_tax_minor": number,"order_id": string,"product_id": string,"quantity": number,"unit_net": number
                  }
                  ComputedFields: never
                  Insert: {
                    "config_snapshot": NonNullable<Json>,"created_at"?: string,"description": string,"design_id"?: string | null,"design_snapshot"?: Json | null,"discount_percent"?: number,"id"?: string,"is_variable_data"?: boolean,"line_gross_minor": number,"line_net_minor": number,"line_tax_minor": number,"order_id": string,"product_id": string,"quantity": number,"unit_net": number
                  }
                  Update: {
                    "config_snapshot"?: NonNullable<Json>,"created_at"?: string,"description"?: string,"design_id"?: string | null,"design_snapshot"?: Json | null,"discount_percent"?: number,"id"?: string,"is_variable_data"?: boolean,"line_gross_minor"?: number,"line_net_minor"?: number,"line_tax_minor"?: number,"order_id"?: string,"product_id"?: string,"quantity"?: number,"unit_net"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_design_id_fkey"
      columns: ["design_id"]
isOneToOne: false
      referencedRelation: "designs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"order_status_history": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"from_status": Database["public"]['Enums']["order_status"] | null,"id": number,"note": string | null,"order_id": string,"to_status": Database["public"]['Enums']["order_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: never,"note"?: string | null,"order_id": string,"to_status": Database["public"]['Enums']["order_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: never,"note"?: string | null,"order_id"?: string,"to_status"?: Database["public"]['Enums']["order_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_status_history_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_status_history_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "approved_proof_id": string | null,"archived_at": string | null,"billing_details": NonNullable<Json>,"cancelled_at": string | null,"checkout_session_id": string | null,"created_at": string,"currency": string,"customer_id": string,"discount_minor": number,"files_unlocked_at": string | null,"id": string,"invoice_number": string | null,"order_number": string,"paid_at": string | null,"payment_provider": string | null,"pricing_snapshot": NonNullable<Json>,"reorder_of_order_id": string | null,"status": Database["public"]['Enums']["order_status"],"subtotal_net_minor": number,"tax_minor": number,"tax_rate": number,"total_gross_minor": number,"updated_at": string,"xero_invoice_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_proof_id"?: string | null,"archived_at"?: string | null,"billing_details"?: NonNullable<Json>,"cancelled_at"?: string | null,"checkout_session_id"?: string | null,"created_at"?: string,"currency": string,"customer_id": string,"discount_minor"?: number,"files_unlocked_at"?: string | null,"id"?: string,"invoice_number"?: string | null,"order_number"?: string,"paid_at"?: string | null,"payment_provider"?: string | null,"pricing_snapshot": NonNullable<Json>,"reorder_of_order_id"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal_net_minor": number,"tax_minor": number,"tax_rate": number,"total_gross_minor": number,"updated_at"?: string,"xero_invoice_id"?: string | null
                  }
                  Update: {
                    "approved_proof_id"?: string | null,"archived_at"?: string | null,"billing_details"?: NonNullable<Json>,"cancelled_at"?: string | null,"checkout_session_id"?: string | null,"created_at"?: string,"currency"?: string,"customer_id"?: string,"discount_minor"?: number,"files_unlocked_at"?: string | null,"id"?: string,"invoice_number"?: string | null,"order_number"?: string,"paid_at"?: string | null,"payment_provider"?: string | null,"pricing_snapshot"?: NonNullable<Json>,"reorder_of_order_id"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal_net_minor"?: number,"tax_minor"?: number,"tax_rate"?: number,"total_gross_minor"?: number,"updated_at"?: string,"xero_invoice_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_approved_proof_fk"
      columns: ["approved_proof_id"]
isOneToOne: false
      referencedRelation: "proof_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_reorder_of_order_id_fkey"
      columns: ["reorder_of_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_minor": number,"created_at": string,"currency": string,"id": string,"order_id": string,"provider": string,"provider_payment_id": string,"raw": NonNullable<Json>,"status": Database["public"]['Enums']["payment_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"currency": string,"id"?: string,"order_id": string,"provider": string,"provider_payment_id": string,"raw"?: NonNullable<Json>,"status": Database["public"]['Enums']["payment_status"]
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"order_id"?: string,"provider"?: string,"provider_payment_id"?: string,"raw"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"product_materials": {
                  Row: {
                    "is_default": boolean,"material_id": string,"price_per_cm2": number,"price_per_unit": number,"product_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "is_default"?: boolean,"material_id": string,"price_per_cm2"?: number,"price_per_unit"?: number,"product_id": string,"sort_order"?: number
                  }
                  Update: {
                    "is_default"?: boolean,"material_id"?: string,"price_per_cm2"?: number,"price_per_unit"?: number,"product_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_materials_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_materials_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"production_files": {
                  Row: {
                    "bleed_mm": number | null,"bytes": number | null,"created_at": string,"dpi": number | null,"height_px": number | null,"id": string,"kind": Database["public"]['Enums']["production_file_kind"],"merge_job_id": string | null,"order_id": string,"proof_version_id": string,"row_index": number | null,"sha256": string | null,"storage_path": string,"trim_mm": Json | null,"width_px": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bleed_mm"?: number | null,"bytes"?: number | null,"created_at"?: string,"dpi"?: number | null,"height_px"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["production_file_kind"],"merge_job_id"?: string | null,"order_id": string,"proof_version_id": string,"row_index"?: number | null,"sha256"?: string | null,"storage_path": string,"trim_mm"?: Json | null,"width_px"?: number | null
                  }
                  Update: {
                    "bleed_mm"?: number | null,"bytes"?: number | null,"created_at"?: string,"dpi"?: number | null,"height_px"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["production_file_kind"],"merge_job_id"?: string | null,"order_id"?: string,"proof_version_id"?: string,"row_index"?: number | null,"sha256"?: string | null,"storage_path"?: string,"trim_mm"?: Json | null,"width_px"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "production_files_merge_job_id_fkey"
      columns: ["merge_job_id"]
isOneToOne: false
      referencedRelation: "merge_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_files_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_files_proof_version_id_fkey"
      columns: ["proof_version_id"]
isOneToOne: false
      referencedRelation: "proof_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "allow_custom_size": boolean,"base_unit_price": number,"bleed_mm": number,"created_at": string,"default_height_mm": number,"default_width_mm": number,"description": string | null,"division_id": string,"id": string,"is_active": boolean,"max_height_mm": number,"max_qty": number,"max_width_mm": number,"min_height_mm": number,"min_qty": number,"min_width_mm": number,"mirror_output": boolean,"name": string,"options": NonNullable<Json>,"orientations": (string)[],"output_dpi": number,"pricing_model": Database["public"]['Enums']["pricing_model"],"qty_step": number,"safe_margin_mm": number,"setup_fee_minor": number,"short_description": string | null,"size_presets": NonNullable<Json>,"slug": string,"sort_order": number,"supports_variable_data": boolean,"updated_at": string,"variable_data_unit_fee": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_custom_size"?: boolean,"base_unit_price"?: number,"bleed_mm"?: number,"created_at"?: string,"default_height_mm": number,"default_width_mm": number,"description"?: string | null,"division_id": string,"id"?: string,"is_active"?: boolean,"max_height_mm": number,"max_qty"?: number,"max_width_mm": number,"min_height_mm": number,"min_qty"?: number,"min_width_mm": number,"mirror_output"?: boolean,"name": string,"options"?: NonNullable<Json>,"orientations"?: (string)[],"output_dpi"?: number,"pricing_model"?: Database["public"]['Enums']["pricing_model"],"qty_step"?: number,"safe_margin_mm"?: number,"setup_fee_minor"?: number,"short_description"?: string | null,"size_presets"?: NonNullable<Json>,"slug": string,"sort_order"?: number,"supports_variable_data"?: boolean,"updated_at"?: string,"variable_data_unit_fee"?: number
                  }
                  Update: {
                    "allow_custom_size"?: boolean,"base_unit_price"?: number,"bleed_mm"?: number,"created_at"?: string,"default_height_mm"?: number,"default_width_mm"?: number,"description"?: string | null,"division_id"?: string,"id"?: string,"is_active"?: boolean,"max_height_mm"?: number,"max_qty"?: number,"max_width_mm"?: number,"min_height_mm"?: number,"min_qty"?: number,"min_width_mm"?: number,"mirror_output"?: boolean,"name"?: string,"options"?: NonNullable<Json>,"orientations"?: (string)[],"output_dpi"?: number,"pricing_model"?: Database["public"]['Enums']["pricing_model"],"qty_step"?: number,"safe_margin_mm"?: number,"setup_fee_minor"?: number,"short_description"?: string | null,"size_presets"?: NonNullable<Json>,"slug"?: string,"sort_order"?: number,"supports_variable_data"?: boolean,"updated_at"?: string,"variable_data_unit_fee"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_division_id_fkey"
      columns: ["division_id"]
isOneToOne: false
      referencedRelation: "divisions"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "company_name": string | null,"created_at": string,"full_name": string | null,"id": string,"marketing_opt_in": boolean,"organization_id": string | null,"phone": string | null,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_name"?: string | null,"created_at"?: string,"full_name"?: string | null,"id": string,"marketing_opt_in"?: boolean,"organization_id"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "company_name"?: string | null,"created_at"?: string,"full_name"?: string | null,"id"?: string,"marketing_opt_in"?: boolean,"organization_id"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"proof_events": {
                  Row: {
                    "action": Database["public"]['Enums']["proof_action"],"actor_id": string | null,"comment": string | null,"created_at": string,"id": string,"ip": unknown,"order_id": string,"proof_version_id": string,"snapshot_hash": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["proof_action"],"actor_id"?: string | null,"comment"?: string | null,"created_at"?: string,"id"?: string,"ip"?: unknown,"order_id": string,"proof_version_id": string,"snapshot_hash": string,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["proof_action"],"actor_id"?: string | null,"comment"?: string | null,"created_at"?: string,"id"?: string,"ip"?: unknown,"order_id"?: string,"proof_version_id"?: string,"snapshot_hash"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "proof_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proof_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proof_events_proof_version_id_fkey"
      columns: ["proof_version_id"]
isOneToOne: false
      referencedRelation: "proof_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"proof_versions": {
                  Row: {
                    "config_snapshot": NonNullable<Json>,"created_at": string,"created_by": string | null,"document_snapshot": Json | null,"id": string,"merge_dataset_hash": string | null,"order_id": string,"proof_pdf_path": string | null,"proof_png_path": string | null,"snapshot_hash": string,"source": Database["public"]['Enums']["proof_source"],"status": Database["public"]['Enums']["proof_status"],"upload_asset_id": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "config_snapshot": NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"document_snapshot"?: Json | null,"id"?: string,"merge_dataset_hash"?: string | null,"order_id": string,"proof_pdf_path"?: string | null,"proof_png_path"?: string | null,"snapshot_hash": string,"source": Database["public"]['Enums']["proof_source"],"status"?: Database["public"]['Enums']["proof_status"],"upload_asset_id"?: string | null,"version": number
                  }
                  Update: {
                    "config_snapshot"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"document_snapshot"?: Json | null,"id"?: string,"merge_dataset_hash"?: string | null,"order_id"?: string,"proof_pdf_path"?: string | null,"proof_png_path"?: string | null,"snapshot_hash"?: string,"source"?: Database["public"]['Enums']["proof_source"],"status"?: Database["public"]['Enums']["proof_status"],"upload_asset_id"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "proof_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proof_versions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proof_versions_upload_asset_id_fkey"
      columns: ["upload_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "company_legal": NonNullable<Json>,"currency": string,"id": boolean,"max_csv_rows": number,"prices_entered_net": boolean,"support_email": string | null,"tax_label": string,"tax_rate": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_legal"?: NonNullable<Json>,"currency"?: string,"id"?: boolean,"max_csv_rows"?: number,"prices_entered_net"?: boolean,"support_email"?: string | null,"tax_label"?: string,"tax_rate"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_legal"?: NonNullable<Json>,"currency"?: string,"id"?: boolean,"max_csv_rows"?: number,"prices_entered_net"?: boolean,"support_email"?: string | null,"tax_label"?: string,"tax_rate"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"templates": {
                  Row: {
                    "created_at": string,"description": string | null,"document": NonNullable<Json>,"group_name": string | null,"id": string,"is_active": boolean,"name": string,"product_id": string,"sort_order": number,"thumbnail_path": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"document": NonNullable<Json>,"group_name"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"product_id": string,"sort_order"?: number,"thumbnail_path"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"document"?: NonNullable<Json>,"group_name"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"product_id"?: string,"sort_order"?: number,"thumbnail_path"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "templates_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_events": {
                  Row: {
                    "event_id": string,"event_type": string,"processed_at": string | null,"provider": string,"received_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"event_type": string,"processed_at"?: string | null,"provider": string,"received_at"?: string
                  }
                  Update: {
                    "event_id"?: string,"event_type"?: string,"processed_at"?: string | null,"provider"?: string,"received_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "approve_proof":
{ Args: { "p_actor_id": string,"p_ip"?: unknown,"p_order_id": string,"p_user_agent"?: string,"p_version": number,"p_version_id": string }; Returns: {
              "config_snapshot": NonNullable<Json>,
"created_at": string,
"created_by": string | null,
"document_snapshot": Json | null,
"id": string,
"merge_dataset_hash": string | null,
"order_id": string,
"proof_pdf_path": string | null,
"proof_png_path": string | null,
"snapshot_hash": string,
"source": Database["public"]['Enums']["proof_source"],
"status": Database["public"]['Enums']["proof_status"],
"upload_asset_id": string | null,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "proof_versions"
        isOneToOne: true
        isSetofReturn: false
      } },
"check_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"create_proof_version":
{ Args: { "p_actor_id"?: string,"p_config": Json,"p_document": Json,"p_order_id": string,"p_pdf_path": string,"p_png_path": string,"p_snapshot_hash": string,"p_source": Database["public"]['Enums']["proof_source"],"p_version": number }; Returns: {
              "config_snapshot": NonNullable<Json>,
"created_at": string,
"created_by": string | null,
"document_snapshot": Json | null,
"id": string,
"merge_dataset_hash": string | null,
"order_id": string,
"proof_pdf_path": string | null,
"proof_png_path": string | null,
"snapshot_hash": string,
"source": Database["public"]['Enums']["proof_source"],
"status": Database["public"]['Enums']["proof_status"],
"upload_asset_id": string | null,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "proof_versions"
        isOneToOne: true
        isSetofReturn: false
      } },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"lock_open_proof":
{ Args: { "p_actor_id": string,"p_order_id": string,"p_version": number,"p_version_id": string }; Returns: {
              "config_snapshot": NonNullable<Json>,
"created_at": string,
"created_by": string | null,
"document_snapshot": Json | null,
"id": string,
"merge_dataset_hash": string | null,
"order_id": string,
"proof_pdf_path": string | null,
"proof_png_path": string | null,
"snapshot_hash": string,
"source": Database["public"]['Enums']["proof_source"],
"status": Database["public"]['Enums']["proof_status"],
"upload_asset_id": string | null,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "proof_versions"
        isOneToOne: true
        isSetofReturn: false
      } },
"next_invoice_number":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"order_transition_allowed":
{ Args: { "from_status": Database["public"]['Enums']["order_status"],"to_status": Database["public"]['Enums']["order_status"] }; Returns: boolean
                           },
"request_proof_changes":
{ Args: { "p_actor_id": string,"p_comment": string,"p_ip"?: unknown,"p_order_id": string,"p_user_agent"?: string,"p_version": number,"p_version_id": string }; Returns: {
              "config_snapshot": NonNullable<Json>,
"created_at": string,
"created_by": string | null,
"document_snapshot": Json | null,
"id": string,
"merge_dataset_hash": string | null,
"order_id": string,
"proof_pdf_path": string | null,
"proof_png_path": string | null,
"snapshot_hash": string,
"source": Database["public"]['Enums']["proof_source"],
"status": Database["public"]['Enums']["proof_status"],
"upload_asset_id": string | null,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "proof_versions"
        isOneToOne: true
        isSetofReturn: false
      } },
"transition_order":
{ Args: { "p_actor_id"?: string,"p_note"?: string,"p_order_id": string,"p_to_status": Database["public"]['Enums']["order_status"] }; Returns: {
              "approved_proof_id": string | null,
"archived_at": string | null,
"billing_details": NonNullable<Json>,
"cancelled_at": string | null,
"checkout_session_id": string | null,
"created_at": string,
"currency": string,
"customer_id": string,
"discount_minor": number,
"files_unlocked_at": string | null,
"id": string,
"invoice_number": string | null,
"order_number": string,
"paid_at": string | null,
"payment_provider": string | null,
"pricing_snapshot": NonNullable<Json>,
"reorder_of_order_id": string | null,
"status": Database["public"]['Enums']["order_status"],
"subtotal_net_minor": number,
"tax_minor": number,
"tax_rate": number,
"total_gross_minor": number,
"updated_at": string,
"xero_invoice_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "asset_kind": "logo"|"artwork"|"csv","asset_status": "pending"|"valid"|"rejected","design_source": "editor"|"upload","merge_status": "validated"|"processing"|"done"|"failed","notification_channel": "email"|"in_app","notification_status": "queued"|"sent"|"failed","order_status": "quote"|"order"|"artwork"|"proof"|"production"|"completed"|"cancelled","payment_status": "pending"|"succeeded"|"failed"|"refunded","pricing_model": "area"|"unit","production_file_kind": "pdf"|"png"|"row_pdf"|"row_png"|"zip","proof_action": "approved"|"changes_requested"|"approved_via_reorder","proof_source": "customer_edit"|"admin_upload"|"reorder","proof_status": "pending"|"changes_requested"|"approved"|"superseded","user_role": "customer"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "asset_kind": ["logo", "artwork", "csv"],"asset_status": ["pending", "valid", "rejected"],"design_source": ["editor", "upload"],"merge_status": ["validated", "processing", "done", "failed"],"notification_channel": ["email", "in_app"],"notification_status": ["queued", "sent", "failed"],"order_status": ["quote", "order", "artwork", "proof", "production", "completed", "cancelled"],"payment_status": ["pending", "succeeded", "failed", "refunded"],"pricing_model": ["area", "unit"],"production_file_kind": ["pdf", "png", "row_pdf", "row_png", "zip"],"proof_action": ["approved", "changes_requested", "approved_via_reorder"],"proof_source": ["customer_edit", "admin_upload", "reorder"],"proof_status": ["pending", "changes_requested", "approved", "superseded"],"user_role": ["customer", "admin"]
          }
        }
} as const
