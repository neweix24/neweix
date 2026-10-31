-- Publish the Campaigns & Missions module in the customer EixVerse hub.
update private.eixverse_modules
set status='active',
    description='Daily check-ins, verified missions, limited-time campaigns and controlled Eixon rewards.',
    updated_at=now()
where module_code='campaigns';
