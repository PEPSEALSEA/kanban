export type UserInfo = {
  email: string;
  name: string;
  picture: string;
};

export type ProgressItem = {
  email: string;
  homework_id: string;
  status: string;
  image_url?: string;
  updated_at?: string;
};

export type Homework = {
  id: string;
  subject: string;
  title: string;
  description: string;
  deadline: string;
  link_work: string;
  link_image: string;
  note: string;
  my_status?: 'pending' | 'in_progress' | 'done';
};

export type LearningContent = {
  id: string;
  date: string;
  subject: string;
  title: string;
  description: string;
  audio_file_id: string;
  audio_url: string;
  attachments: string;
  links: string;
};
